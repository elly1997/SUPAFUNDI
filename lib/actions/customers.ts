"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildCustomerDepositJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { creditAccountFromPosSale } from "@/lib/actions/banking";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function paymentsDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

const customerInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  customerType: z
    .enum(["retail", "wholesale", "trade", "contractor", "vip"])
    .default("retail"),
  creditLimit: z.coerce.number().nonnegative().default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  priceType: z.enum(["retail", "wholesale", "trade", "vip"]).default("retail"),
  openingCredit: z.coerce.number().nonnegative().default(0),
  openingDeposit: z.coerce.number().nonnegative().default(0),
});

const customerUpdateInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  customerType: z
    .enum(["retail", "wholesale", "trade", "contractor", "vip"])
    .optional(),
  creditLimit: z.coerce.number().nonnegative().optional(),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  priceType: z.enum(["retail", "wholesale", "trade", "vip"]).optional(),
});

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string | null;
  customer_type: string;
  credit_limit: number;
  credit_days: number;
  outstanding_balance: number;
  deposit_balance: number;
  is_active: boolean;
};

export async function listCustomers(): Promise<CustomerListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, customer_type, credit_limit, credit_days, outstanding_balance, deposit_balance, is_active"
    )
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    customer_type: c.customer_type,
    credit_limit: Number(c.credit_limit),
    credit_days: c.credit_days,
    outstanding_balance: Number(c.outstanding_balance),
    deposit_balance: Number(c.deposit_balance ?? 0),
    is_active: c.is_active,
  }));
}

const depositInput = z.object({
  customerId: z.string().uuid(),
  outletId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bankAccountId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export async function recordCustomerDeposit(
  raw: z.infer<typeof depositInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = depositInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("deposit_balance, name")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) return { ok: false, message: "Customer not found." };

    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);
    const paymentTs = `${paymentDate}T12:00:00.000Z`;

    const newBalance = roundMoney(
      Number(customer.deposit_balance ?? 0) + input.amount
    );
    const { error: updErr } = await supabase
      .from("customers")
      .update({ deposit_balance: newBalance })
      .eq("id", input.customerId);
    if (updErr) return { ok: false, message: updErr.message };

    const { data: payment, error: payErr } = await paymentsDb(supabase)
      .from("payments")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        payment_method: input.paymentMethod,
        amount: input.amount,
        reference_no: input.notes?.trim() || `DEP-${customer.name}`,
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: input.customerId,
      })
      .select("id")
      .single();
    if (payErr) {
      await supabase
        .from("customers")
        .update({ deposit_balance: Number(customer.deposit_balance ?? 0) })
        .eq("id", input.customerId);
      return { ok: false, message: payErr.message };
    }

    const journal = await postJournalEntry({
      description: `Customer deposit — ${customer.name}`,
      sourceType: "payment",
      sourceId: payment?.id,
      outletId: input.outletId,
      entryDate: paymentDate,
      lines: buildCustomerDepositJournalLines(
        input.amount,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      await supabase.from("payments").delete().eq("id", payment?.id);
      await supabase
        .from("customers")
        .update({ deposit_balance: Number(customer.deposit_balance ?? 0) })
        .eq("id", input.customerId);
      return { ok: false, message: journal.message };
    }

    if (
      input.bankAccountId &&
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer")
    ) {
      const bank = await creditAccountFromPosSale(
        input.bankAccountId,
        input.amount,
        payment!.id,
        `DEP-${customer.name}`,
        paymentDate
      );
      if (!bank.ok) {
        await supabase.from("payments").delete().eq("id", payment?.id);
        await supabase
          .from("customers")
          .update({ deposit_balance: Number(customer.deposit_balance ?? 0) })
          .eq("id", input.customerId);
        return bank;
      }
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath("/finance/credit");
    revalidatePath("/finance/banking");
    revalidatePath("/daily-closing");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Deposit failed",
    };
  }
}

export async function createCustomer(
  raw: z.infer<typeof customerInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = customerInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: ctx.organizationId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        customer_type: input.customerType,
        credit_limit: input.creditLimit,
        credit_days: input.creditDays,
        price_type: input.priceType,
        outstanding_balance: input.openingCredit,
        deposit_balance: input.openingDeposit,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Create failed" };
    }

    if (input.openingCredit > 0) {
      await paymentsDb(supabase)
        .from("credit_ledger")
        .insert({
          organization_id: ctx.organizationId,
          customer_id: data.id,
          entry_type: "invoice",
          reference_type: "opening_balance",
          debit: input.openingCredit,
          credit: 0,
          balance: input.openingCredit,
          description: "Opening credit balance",
          created_by: ctx.userId,
        });
    }

    if (input.openingDeposit > 0 && ctx.outletId) {
      await recordCustomerDeposit({
        customerId: data.id,
        outletId: ctx.outletId,
        amount: input.openingDeposit,
        paymentMethod: "cash",
        notes: "Opening deposit balance",
      });
    }

    revalidatePath("/customers");
    revalidatePath("/pos");
    revalidatePath("/finance/credit");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create customer failed",
    };
  }
}

export async function updateCustomer(
  id: string,
  raw: z.infer<typeof customerUpdateInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = customerUpdateInput.parse(raw);
    const { organizationId } = await requireManagerContext();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        ...(input.customerType !== undefined
          ? { customer_type: input.customerType }
          : {}),
        ...(input.creditLimit !== undefined
          ? { credit_limit: input.creditLimit }
          : {}),
        ...(input.creditDays !== undefined
          ? { credit_days: input.creditDays }
          : {}),
        ...(input.priceType !== undefined
          ? { price_type: input.priceType }
          : {}),
      })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: "Customer not found." };
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    revalidatePath("/pos");
    revalidatePath("/finance/credit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

async function customerDeleteBlockers(
  supabase: Supabase,
  organizationId: string,
  customerId: string
): Promise<string | null> {
  const { data: customer } = await supabase
    .from("customers")
    .select("outstanding_balance, deposit_balance")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!customer) return "Customer not found.";
  if (Number(customer.outstanding_balance) > 0) {
    return "Customer has an open credit balance. Record payments or adjust balance first.";
  }
  if (Number(customer.deposit_balance ?? 0) > 0) {
    return "Customer has deposit balance. Refund or transfer deposits first.";
  }

  const { count: sales } = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId);
  if ((sales ?? 0) > 0) {
    return "Customer has sales history. Cannot delete.";
  }

  const { count: payments } = await paymentsDb(supabase)
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId);
  if ((payments ?? 0) > 0) {
    return "Customer has payment or deposit history. Cannot delete.";
  }

  const { count: ledger } = await paymentsDb(supabase)
    .from("credit_ledger")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId);
  if ((ledger ?? 0) > 0) {
    return "Customer has credit ledger entries. Cannot delete.";
  }

  return null;
}

export async function deleteCustomer(
  customerId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { organizationId } = await requireManagerContext();
    const supabase = await createServerSupabaseClient();
    const blocked = await customerDeleteBlockers(
      supabase,
      organizationId,
      customerId
    );
    if (blocked) return { ok: false, message: blocked };

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", customerId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/customers");
    revalidatePath("/pos");
    revalidatePath("/finance/credit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Delete failed",
    };
  }
}

export type CustomerDetail = CustomerListRow & {
  email: string | null;
  address: string | null;
  credit_days: number;
  price_type: string;
  recentSales: {
    id: string;
    invoice_no: string;
    sale_date: string;
    total_amount: number;
    balance_due: number;
  }[];
};

export async function getCustomerById(
  id: string
): Promise<CustomerDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: c, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, email, address, customer_type, credit_limit, credit_days, outstanding_balance, deposit_balance, price_type, is_active"
    )
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !c) return null;

  const { data: sales } = await supabase
    .from("sales")
    .select("id, invoice_no, sale_date, total_amount, balance_due")
    .eq("customer_id", id)
    .order("sale_date", { ascending: false })
    .limit(10);

  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    customer_type: c.customer_type,
    credit_limit: Number(c.credit_limit),
    credit_days: c.credit_days,
    outstanding_balance: Number(c.outstanding_balance),
    deposit_balance: Number(c.deposit_balance ?? 0),
    price_type: c.price_type,
    is_active: c.is_active,
    recentSales: (sales ?? []).map((s) => ({
      id: s.id,
      invoice_no: s.invoice_no,
      sale_date: s.sale_date,
      total_amount: Number(s.total_amount),
      balance_due: Number(s.balance_due),
    })),
  };
}
