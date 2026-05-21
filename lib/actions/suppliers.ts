"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildSupplierPaymentJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { recordBankTransaction } from "@/lib/actions/banking";
import { createManualSupplierBill } from "@/lib/actions/payables";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** AP tables exist in migrations; regenerate `types/database.ts` to type them natively. */
function apDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}

const supplierInput = z.object({
  name: z.string().min(1).max(200),
  contactPerson: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  creditLimit: z.number().nonnegative().default(0),
  creditDays: z.number().int().min(0).default(30),
  openingBalance: z.coerce.number().nonnegative().default(0),
  openingBalanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type SupplierListRow = {
  id: string;
  name: string;
  phone: string | null;
  contact_person: string | null;
  credit_limit: number;
  payables_balance: number;
  is_active: boolean;
};

export type SupplierDetail = {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: number;
  credit_days: number;
  payables_balance: number;
  bills: {
    id: string;
    bill_no: string;
    bill_date: string;
    due_date: string | null;
    total_amount: number;
    amount_paid: number;
    balance: number;
    status: string;
  }[];
  purchase_orders: {
    id: string;
    reference_no: string | null;
    status: string;
    order_date: string;
    total_amount: number;
  }[];
};

type SupplierBillRow = {
  supplier_id: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
};

async function payablesBySupplier(
  supabase: SupabaseClient,
  organizationId: string,
  supplierIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (supplierIds.length === 0) return map;

  const { data: bills } = await apDb(supabase)
    .from("supplier_bills")
    .select("supplier_id, total_amount, amount_paid, status")
    .eq("organization_id", organizationId)
    .in("supplier_id", supplierIds)
    .in("status", ["open", "partial", "draft"]);

  const billRows = (bills ?? []) as SupplierBillRow[];

  for (const b of billRows) {
    if (!b.supplier_id) continue;
    const balance = roundMoney(
      Number(b.total_amount) - Number(b.amount_paid)
    );
    if (balance <= 0) continue;
    map.set(b.supplier_id, roundMoney((map.get(b.supplier_id) ?? 0) + balance));
  }

  return map;
}

export async function listSuppliers(): Promise<SupplierListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await apDb(supabase)
    .from("suppliers")
    .select(
      "id, name, phone, contact_person, credit_limit, is_active"
    )
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    contact_person: string | null;
    credit_limit: number;
    is_active: boolean;
  }[];
  const payables = await payablesBySupplier(
    supabase,
    ctx.organizationId,
    rows.map((r) => r.id)
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    contact_person: r.contact_person,
    credit_limit: Number(r.credit_limit),
    payables_balance: payables.get(r.id) ?? 0,
    is_active: r.is_active,
  }));
}

export async function getSupplierDetail(
  supplierId: string
): Promise<SupplierDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: supplier, error } = await apDb(supabase)
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !supplier) return null;

  const s = supplier as {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    credit_limit: number;
    credit_days: number;
  };

  const payables = await payablesBySupplier(supabase, ctx.organizationId, [
    supplierId,
  ]);

  const { data: bills } = await apDb(supabase)
    .from("supplier_bills")
    .select(
      "id, bill_no, bill_date, due_date, total_amount, amount_paid, status"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("supplier_id", supplierId)
    .order("bill_date", { ascending: false })
    .limit(50);

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("id, reference_no, status, order_date, total_amount")
    .eq("organization_id", ctx.organizationId)
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(20);

  return {
    id: s.id,
    name: s.name,
    contact_person: s.contact_person,
    phone: s.phone,
    email: s.email,
    address: s.address,
    credit_limit: Number(s.credit_limit),
    credit_days: s.credit_days,
    payables_balance: payables.get(supplierId) ?? 0,
    bills: ((bills ?? []) as {
      id: string;
      bill_no: string;
      bill_date: string;
      due_date: string | null;
      total_amount: number;
      amount_paid: number;
      status: string;
    }[]).map((b) => ({
      id: b.id,
      bill_no: b.bill_no,
      bill_date: b.bill_date,
      due_date: b.due_date,
      total_amount: Number(b.total_amount),
      amount_paid: Number(b.amount_paid),
      balance: roundMoney(Number(b.total_amount) - Number(b.amount_paid)),
      status: b.status,
    })),
    purchase_orders: (pos ?? []).map((p) => ({
      id: p.id,
      reference_no: p.reference_no,
      status: p.status,
      order_date: p.order_date,
      total_amount: Number(p.total_amount),
    })),
  };
}

export async function createSupplierRecord(
  raw: z.infer<typeof supplierInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const input = supplierInput.parse(raw);
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await apDb(supabase)
    .from("suppliers")
    .insert({
      organization_id: ctx.organizationId,
      name: input.name.trim(),
      contact_person: input.contactPerson?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      address: input.address?.trim() || null,
      credit_limit: input.creditLimit,
      credit_days: input.creditDays,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Create failed" };
  }

  if (input.openingBalance > 0) {
    const billDate =
      input.openingBalanceDate ?? new Date().toISOString().slice(0, 10);
    const bill = await createManualSupplierBill({
      supplierId: data.id,
      billDate,
      totalAmount: input.openingBalance,
      notes: "Opening balance",
    });
    if (!bill.ok) {
      return { ok: false, message: bill.message };
    }
  }

  revalidatePath("/suppliers");
  revalidatePath("/finance/payables");
  revalidatePath("/inventory/purchase-orders");
  return { ok: true, id: data.id };
}

const paySupplierInput = z.object({
  supplierId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z
    .enum(["cash", "mpesa", "bank_transfer", "cheque"])
    .default("cash"),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
  billId: z.string().uuid().optional(),
});

const payBillInput = z.object({
  billId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z
    .enum(["cash", "mpesa", "bank_transfer", "cheque"])
    .default("cash"),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
});

type BillSlice = { billId: string; amount: number };

async function planBillAllocations(
  supabase: SupabaseClient,
  organizationId: string,
  supplierId: string,
  totalAmount: number,
  billId?: string
): Promise<{ ok: true; slices: BillSlice[] } | { ok: false; message: string }> {
  if (billId) {
    const { data: bill } = await apDb(supabase)
      .from("supplier_bills")
      .select("id, supplier_id, total_amount, amount_paid")
      .eq("id", billId)
      .eq("organization_id", organizationId)
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (!bill) return { ok: false, message: "Bill not found." };
    const balance = roundMoney(
      Number(bill.total_amount) - Number(bill.amount_paid)
    );
    if (totalAmount > balance) {
      return {
        ok: false,
        message: `Payment exceeds bill balance (${balance}).`,
      };
    }
    return { ok: true, slices: [{ billId, amount: totalAmount }] };
  }

  const { data: bills } = await apDb(supabase)
    .from("supplier_bills")
    .select("id, total_amount, amount_paid")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .in("status", ["open", "partial", "draft"])
    .order("bill_date", { ascending: true });

  let remaining = totalAmount;
  const slices: BillSlice[] = [];
  for (const b of bills ?? []) {
    if (remaining <= 0) break;
    const balance = roundMoney(
      Number(b.total_amount) - Number(b.amount_paid)
    );
    if (balance <= 0) continue;
    const slice = roundMoney(Math.min(remaining, balance));
    slices.push({ billId: b.id, amount: slice });
    remaining = roundMoney(remaining - slice);
  }

  if (remaining > 0) {
    return {
      ok: false,
      message: `Payment exceeds open payables by ${remaining}.`,
    };
  }
  if (slices.length === 0) {
    return { ok: false, message: "No open bills to pay." };
  }
  return { ok: true, slices };
}

export async function paySupplier(
  raw: z.infer<typeof paySupplierInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = paySupplierInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);

    const plan = await planBillAllocations(
      supabase,
      ctx.organizationId,
      input.supplierId,
      input.amount,
      input.billId
    );
    if (!plan.ok) return plan;

    const paymentIds: string[] = [];

    for (const slice of plan.slices) {
      const { data: bill } = await apDb(supabase)
        .from("supplier_bills")
        .select("id, total_amount, amount_paid, status")
        .eq("id", slice.billId)
        .maybeSingle();
      if (!bill) return { ok: false, message: "Bill not found." };

      const newPaid = roundMoney(Number(bill.amount_paid) + slice.amount);
      const newStatus =
        newPaid >= Number(bill.total_amount)
          ? "paid"
          : newPaid > 0
            ? "partial"
            : bill.status;

      const { data: payRow, error: payErr } = await apDb(supabase)
        .from("supplier_payments")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: ctx.outletId ?? null,
          supplier_id: input.supplierId,
          bill_id: slice.billId,
          payment_method: input.paymentMethod,
          amount: slice.amount,
          reference_no: input.referenceNo?.trim() || null,
          payment_date: paymentDate,
          bank_account_id: input.bankAccountId ?? null,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (payErr || !payRow) {
        return { ok: false, message: payErr?.message ?? "Payment failed" };
      }
      paymentIds.push(payRow.id);

      const { error: updErr } = await apDb(supabase)
        .from("supplier_bills")
        .update({ amount_paid: newPaid, status: newStatus })
        .eq("id", slice.billId);
      if (updErr) return { ok: false, message: updErr.message };
    }

    const journal = await postJournalEntry({
      description: `Supplier payment`,
      sourceType: "payment",
      sourceId: paymentIds[0],
      outletId: ctx.outletId ?? undefined,
      entryDate: paymentDate,
      lines: buildSupplierPaymentJournalLines(
        input.amount,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      return { ok: false, message: journal.message };
    }

    if (
      input.bankAccountId &&
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer" ||
        input.paymentMethod === "cheque")
    ) {
      const bank = await recordBankTransaction({
        bankAccountId: input.bankAccountId,
        transactionType: "withdrawal",
        amount: input.amount,
        referenceNo: input.referenceNo?.trim() || undefined,
        description: `Supplier payment`,
        transactionDate: paymentDate,
      });
      if (!bank.ok) return bank;
    }

    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${input.supplierId}`);
    revalidatePath("/finance/payables");
    revalidatePath("/finance/banking");
    revalidatePath("/daily-closing");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Payment failed",
    };
  }
}

export async function paySupplierBill(
  raw: z.infer<typeof payBillInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  const input = payBillInput.parse(raw);
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: bill } = await apDb(supabase)
    .from("supplier_bills")
    .select("supplier_id")
    .eq("id", input.billId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!bill?.supplier_id) {
    return { ok: false, message: "Bill not found." };
  }
  return paySupplier({
    supplierId: bill.supplier_id,
    amount: input.amount,
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate,
    bankAccountId: input.bankAccountId,
    referenceNo: input.referenceNo,
    billId: input.billId,
  });
}
