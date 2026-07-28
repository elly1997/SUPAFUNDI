"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  applyAmountToCustomerCredit,
  applyCustomerDepositToCredit,
  syncCustomerDeposits,
  syncCustomersWithDepositAndCredit,
} from "@/lib/actions/credit";
import { buildCustomerDepositReceiptJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { creditAccountFromPosSale } from "@/lib/actions/banking";
import {
  formatCustomerDepositReference,
  isCustomerDepositRef,
} from "@/lib/constants/party-payments";
import {
  buildCustomerDepositLedger,
  computeDepositBalanceFromParts,
  summarizeDepositLedger,
  type CustomerDepositLedgerRow,
} from "@/lib/finance/customer-deposit-ledger";
import { requireManagerContext } from "@/lib/server/require-manager";
import { checkBusinessDayMutable } from "@/lib/server/business-day-guard";
import { requireOrgContext } from "@/lib/server/org-context";
import { resolveWorkingOutletId } from "@/lib/customers/working-outlet";
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
  const outletId = await resolveWorkingOutletId(ctx);

  await syncCustomersWithDepositAndCredit();

  let query = supabase
    .from("customers")
    .select(
      "id, name, phone, customer_type, credit_limit, credit_days, outstanding_balance, deposit_balance, is_active"
    )
    .eq("organization_id", ctx.organizationId)
    .order("name");

  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }

  const { data, error } = await query;
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
    if (
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer") &&
      !input.bankAccountId
    ) {
      return {
        ok: false,
        message: "Select the M-Pesa or bank account that received this deposit.",
      };
    }
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);
    const dayCheck = await checkBusinessDayMutable(input.outletId, paymentDate);
    if (!dayCheck.ok) return dayCheck;

    const { data: customer } = await supabase
      .from("customers")
      .select("deposit_balance, outstanding_balance, name")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) return { ok: false, message: "Customer not found." };

    const paymentTs = `${paymentDate}T12:00:00.000Z`;
    const depRef = formatCustomerDepositReference(customer.name, input.notes);

    const outstanding = roundMoney(Number(customer.outstanding_balance ?? 0));
    const prevDeposit = roundMoney(Number(customer.deposit_balance ?? 0));
    /** Cash that pays existing AR is not prepaid — keep DEP rows = true prepaid only. */
    const toCredit = roundMoney(Math.min(input.amount, outstanding));
    const toDeposit = roundMoney(input.amount - toCredit);
    const newDepositBalance = roundMoney(prevDeposit + toDeposit);

    const createdPaymentIds: string[] = [];
    let journalSourceId: string | undefined;

    /** Prepaid slice only — counted once as cashCustomerDeposits. */
    if (toDeposit > 0) {
      const { data: payment, error: payErr } = await paymentsDb(supabase)
        .from("payments")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: input.outletId,
          payment_method: input.paymentMethod,
          amount: toDeposit,
          reference_no: depRef,
          status: "completed",
          payment_date: paymentTs,
          received_by: ctx.userId,
          customer_id: input.customerId,
        })
        .select("id")
        .single();
      if (payErr || !payment) {
        return { ok: false, message: payErr?.message ?? "Deposit payment failed" };
      }
      createdPaymentIds.push(payment.id);
      journalSourceId = payment.id;
    }

    const rollbackPayments = async () => {
      for (const id of createdPaymentIds) {
        await supabase.from("payments").delete().eq("id", id);
      }
      if (toDeposit > 0) {
        await supabase
          .from("customers")
          .update({ deposit_balance: prevDeposit })
          .eq("id", input.customerId);
      }
    };

    if (toDeposit > 0) {
      const { error: depErr } = await supabase
        .from("customers")
        .update({ deposit_balance: newDepositBalance })
        .eq("id", input.customerId);
      if (depErr) {
        await rollbackPayments();
        return { ok: false, message: depErr.message };
      }
    }

    /** AR slice — cash counted once as cashCustomerPayments (invoice-linked). */
    if (toCredit > 0) {
      const credit = await applyAmountToCustomerCredit(supabase, ctx, {
        customerId: input.customerId,
        customerName: customer.name,
        amount: toCredit,
        currentOutstanding: outstanding,
        entryDate: paymentDate,
        paymentTs,
        outletId: input.outletId,
        ledgerReferenceType: "cash_to_credit",
        ledgerDescription: "Cash applied to prior credit",
        paymentMethod: input.paymentMethod,
        paymentReference: undefined,
      });
      if (!credit.ok) {
        await rollbackPayments();
        return credit;
      }
      if (!journalSourceId && credit.ledgerId) {
        journalSourceId = credit.ledgerId;
      }
    }

    const journal = await postJournalEntry({
      description:
        toCredit > 0 && toDeposit <= 0
          ? `Customer payment (credit) — ${customer.name}`
          : toCredit > 0
            ? `Customer cash — credit + deposit — ${customer.name}`
            : `Customer deposit — ${customer.name}`,
      sourceType: "payment",
      sourceId: journalSourceId,
      outletId: input.outletId,
      entryDate: paymentDate,
      lines: buildCustomerDepositReceiptJournalLines(
        input.amount,
        toCredit,
        toDeposit,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      await rollbackPayments();
      return { ok: false, message: journal.message };
    }

    if (
      input.bankAccountId &&
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer")
    ) {
      const bankSourceId = createdPaymentIds[0] ?? journalSourceId;
      if (!bankSourceId) {
        await rollbackPayments();
        return { ok: false, message: "Missing payment id for bank credit." };
      }
      const bank = await creditAccountFromPosSale(
        input.bankAccountId,
        input.amount,
        bankSourceId,
        toDeposit > 0 ? depRef : `AR-${customer.name}`,
        paymentDate,
        toDeposit > 0 && toCredit > 0
          ? `Customer cash (deposit + credit) — ${customer.name}`
          : toDeposit > 0
            ? `Customer deposit — ${customer.name}`
            : `Customer credit payment — ${customer.name}`
      );
      if (!bank.ok) {
        await rollbackPayments();
        return bank;
      }
    }

    await applyCustomerDepositToCredit(input.customerId, {
      outletId: input.outletId,
      entryDate: paymentDate,
    });

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
    const outletId = await resolveWorkingOutletId(ctx);
    if (!outletId) {
      return {
        ok: false,
        message: "Select a working outlet before creating a customer.",
      };
    }
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: outletId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        customer_type: input.customerType,
        credit_limit: input.creditLimit,
        credit_days: input.creditDays,
        price_type: input.priceType,
        outstanding_balance: input.openingCredit,
        deposit_balance:
          input.openingDeposit > 0 ? 0 : input.openingDeposit,
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

    if (input.openingDeposit > 0) {
      await recordCustomerDeposit({
        customerId: data.id,
        outletId,
        amount: input.openingDeposit,
        paymentMethod: "cash",
        notes: "Opening deposit balance",
      });
    }

    revalidatePath("/customers");
    revalidatePath("/pos");
    revalidatePath("/finance/credit");
    revalidatePath("/customers");
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
    revalidatePath("/customers");
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
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Delete failed",
    };
  }
}

export type CustomerDepositSummary = {
  /** Authoritative prepaid (customers.deposit_balance). */
  balance: number;
  total_received: number;
  total_applied: number;
  /** True when reconstructed ledger ≠ stored balance (legacy rows). */
  ledgerMismatch: boolean;
};

export async function getCustomerDepositLedger(
  customerId: string
): Promise<{
  rows: CustomerDepositLedgerRow[];
  summary: CustomerDepositSummary;
}> {
  await syncCustomerDeposits(customerId);

  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: receipts } = await supabase
    .from("payments")
    .select(
      "id, amount, payment_method, reference_no, payment_date, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .is("sale_id", null)
    .order("payment_date", { ascending: true });

  const { data: appliedSales } = await supabase
    .from("sales")
    .select("id, invoice_no, sale_date, deposit_applied")
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .eq("status", "completed")
    .gt("deposit_applied", 0)
    .order("sale_date", { ascending: true });

  const { data: ledgerAdj } = await paymentsDb(supabase)
    .from("credit_ledger")
    .select(
      "id, credit, debit, entry_date, description, reference_type, reference_id"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .in("reference_type", [
      "deposit_to_credit",
      "cash_to_credit",
      "deposit_applied",
      "deposit_restore_void",
    ])
    .order("entry_date", { ascending: true });

  const cancelledSaleIds = new Set<string>();
  const saleRefs = (ledgerAdj ?? [])
    .map((e: { reference_id: string | null }) => e.reference_id)
    .filter((id: string | null): id is string => !!id);
  if (saleRefs.length > 0) {
    const { data: cancelled } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "cancelled")
      .in("id", saleRefs);
    for (const s of cancelled ?? []) cancelledSaleIds.add(s.id);
  }

  const adjustments = (ledgerAdj ?? [])
    .filter((e: {
      description: string | null;
      reference_id: string | null;
      reference_type: string;
      credit: number | null;
      debit: number | null;
    }) => {
      const desc = String(e.description ?? "");
      if (desc.startsWith("REVERSED")) return false;
      if (
        e.reference_id &&
        cancelledSaleIds.has(e.reference_id) &&
        e.reference_type !== "deposit_restore_void"
      ) {
        return false;
      }
      return true;
    })
    .map((e: {
      id: string;
      credit: number | null;
      debit: number | null;
      entry_date: string;
      description: string | null;
      reference_type: string;
    }) => {
      if (e.reference_type === "deposit_restore_void") {
        return {
          id: String(e.id),
          amount: Number(e.debit ?? 0),
          entry_date: String(e.entry_date),
          description: e.description ? String(e.description) : null,
          kind: "received" as const,
        };
      }
      return {
        id: String(e.id),
        amount: Number(e.credit ?? 0),
        entry_date: String(e.entry_date),
        description: e.description ? String(e.description) : null,
        kind: "applied" as const,
      };
    })
    .filter((e: { amount: number }) => e.amount > 0);

  const depReceipts = (receipts ?? []).filter((r) =>
    isCustomerDepositRef(r.reference_no)
  );

  const rows = buildCustomerDepositLedger(
    depReceipts.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      payment_method: String(r.payment_method),
      reference_no: r.reference_no,
      payment_date: r.payment_date,
      created_at: r.created_at,
    })),
    (appliedSales ?? []).map((s) => ({
      id: s.id,
      invoice_no: s.invoice_no,
      sale_date: s.sale_date,
      deposit_applied: Number(s.deposit_applied ?? 0),
    })),
    adjustments
  );

  const ledgerSummary = summarizeDepositLedger([...rows].reverse());
  const { data: customer } = await supabase
    .from("customers")
    .select("deposit_balance")
    .eq("id", customerId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  const stored = roundMoney(Number(customer?.deposit_balance ?? 0));

  return {
    rows,
    summary: {
      balance: stored,
      total_received: ledgerSummary.total_received,
      total_applied: ledgerSummary.total_applied,
      ledgerMismatch: stored !== ledgerSummary.balance,
    },
  };
}

/**
 * Align customers.deposit_balance with DEP receipts − invoice applications −
 * prior-credit applications (fixes legacy overstated statements).
 * Also recovers prepaid stuck on voided sales (payments still linked to cancelled invoices).
 */
export async function repairCustomerDepositBalance(
  customerId: string
): Promise<
  | { ok: true; previous: number; next: number }
  | { ok: false; message: string }
> {
  try {
    const ctx = await requireManagerContext();
    const supabase = await createServerSupabaseClient();

    const { data: customer } = await supabase
      .from("customers")
      .select("id, deposit_balance, outstanding_balance, name")
      .eq("id", customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) return { ok: false, message: "Customer not found." };

    const previous = roundMoney(Number(customer.deposit_balance ?? 0));
    let restoredFromVoids = 0;

    const { data: cancelledSales } = await supabase
      .from("sales")
      .select("id, invoice_no, deposit_applied")
      .eq("organization_id", ctx.organizationId)
      .eq("customer_id", customerId)
      .eq("status", "cancelled");

    for (const sale of cancelledSales ?? []) {
      const { data: salePayments } = await supabase
        .from("payments")
        .select("id, amount, payment_method")
        .eq("sale_id", sale.id)
        .eq("status", "completed");

      for (const p of salePayments ?? []) {
        const method = String(p.payment_method);
        const amt = roundMoney(Number(p.amount));
        if (method === "credit_account" || amt <= 0) {
          await supabase.from("payments").delete().eq("id", p.id);
          continue;
        }
        const depRef = formatCustomerDepositReference(
          `void-${sale.invoice_no}`
        );
        await paymentsDb(supabase)
          .from("payments")
          .update({
            sale_id: null,
            reference_no: depRef,
            customer_id: customerId,
          } as never)
          .eq("id", p.id);
        restoredFromVoids = roundMoney(restoredFromVoids + amt);
      }

      const leftoverDep = roundMoney(Number(sale.deposit_applied ?? 0));
      if (leftoverDep > 0) {
        restoredFromVoids = roundMoney(restoredFromVoids + leftoverDep);
        await supabase
          .from("sales")
          .update({ deposit_applied: 0 })
          .eq("id", sale.id);
      }

      await paymentsDb(supabase)
        .from("credit_ledger")
        .update({
          description: `REVERSED — void ${sale.invoice_no}`,
        } as never)
        .eq("reference_id", sale.id)
        .in("reference_type", [
          "deposit_applied",
          "deposit_to_credit",
          "cash_to_credit",
        ]);
    }

    /** Legacy deposit_to_credit rows without sale id — mark reversed up to restored amount. */
    if (restoredFromVoids > 0) {
      const { data: orphans } = await paymentsDb(supabase)
        .from("credit_ledger")
        .select("id, credit, description")
        .eq("organization_id", ctx.organizationId)
        .eq("customer_id", customerId)
        .in("reference_type", ["deposit_to_credit", "deposit_applied"])
        .is("reference_id", null)
        .order("entry_date", { ascending: true });

      let left = restoredFromVoids;
      for (const row of orphans ?? []) {
        if (left <= 0) break;
        const desc = String(
          (row as { description: string | null }).description ?? ""
        );
        if (desc.startsWith("REVERSED")) continue;
        const credit = roundMoney(
          Number((row as { credit: number | null }).credit ?? 0)
        );
        if (credit <= 0) continue;
        await paymentsDb(supabase)
          .from("credit_ledger")
          .update({
            description: `REVERSED — void restore`,
          } as never)
          .eq("id", (row as { id: string }).id);
        left = roundMoney(left - credit);
      }

      await paymentsDb(supabase).from("credit_ledger").insert({
        organization_id: ctx.organizationId,
        customer_id: customerId,
        entry_type: "adjustment",
        reference_type: "deposit_restore_void",
        debit: restoredFromVoids,
        credit: 0,
        balance: roundMoney(Number(customer.outstanding_balance ?? 0)),
        description: "Repair — restore deposit from voided sales",
        entry_date: new Date().toISOString().slice(0, 10),
        created_by: ctx.userId,
      } as never);
    }

    const { data: receipts } = await supabase
      .from("payments")
      .select("amount, reference_no")
      .eq("organization_id", ctx.organizationId)
      .eq("customer_id", customerId)
      .is("sale_id", null);

    const receiptsTotal = roundMoney(
      (receipts ?? [])
        .filter((r) => isCustomerDepositRef(r.reference_no))
        .reduce((s, r) => s + Number(r.amount), 0)
    );

    const { data: appliedSales } = await supabase
      .from("sales")
      .select("deposit_applied")
      .eq("organization_id", ctx.organizationId)
      .eq("customer_id", customerId)
      .eq("status", "completed")
      .gt("deposit_applied", 0);

    const appliedToInvoices = roundMoney(
      (appliedSales ?? []).reduce(
        (s, row) => s + Number(row.deposit_applied ?? 0),
        0
      )
    );

    const { data: toCreditRows } = await paymentsDb(supabase)
      .from("credit_ledger")
      .select("credit, description, reference_type")
      .eq("organization_id", ctx.organizationId)
      .eq("customer_id", customerId)
      .in("reference_type", [
        "deposit_to_credit",
        "cash_to_credit",
        "deposit_applied",
      ]);

    const appliedToPriorCredit = roundMoney(
      (toCreditRows ?? []).reduce(
        (
          s: number,
          row: { credit: number | null; description: string | null }
        ) => {
          if (String(row.description ?? "").startsWith("REVERSED")) return s;
          return s + Number(row.credit ?? 0);
        },
        0
      )
    );

    const { data: restores } = await paymentsDb(supabase)
      .from("credit_ledger")
      .select("debit")
      .eq("organization_id", ctx.organizationId)
      .eq("customer_id", customerId)
      .eq("reference_type", "deposit_restore_void");

    const restoreTotal = roundMoney(
      (restores ?? []).reduce(
        (s: number, row: { debit: number | null }) =>
          s + Number(row.debit ?? 0),
        0
      )
    );

    /**
     * receiptsTotal already includes void-converted DEP payments.
     * restoreTotal is a statement marker — do not double-count into balance
     * when those same DEP rows exist. Prefer DEP − applications.
     */
    const next = computeDepositBalanceFromParts({
      receiptsTotal,
      appliedToInvoices,
      appliedToPriorCredit,
    });

    const { data: openSales } = await supabase
      .from("sales")
      .select("balance_due")
      .eq("customer_id", customerId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "completed")
      .gt("balance_due", 0);

    const newOutstanding = roundMoney(
      (openSales ?? []).reduce((s, row) => s + Number(row.balance_due), 0)
    );

    const { error } = await supabase
      .from("customers")
      .update({
        deposit_balance: next,
        outstanding_balance: newOutstanding,
      })
      .eq("id", customerId);
    if (error) return { ok: false, message: error.message };

    await applyCustomerDepositToCredit(customerId);

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/pos");
    void restoreTotal;
    return { ok: true, previous, next };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Repair failed",
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
    deposit_applied: number;
  }[];
  depositLedger: CustomerDepositLedgerRow[];
  depositSummary: CustomerDepositSummary;
};

export async function getCustomerById(
  id: string
): Promise<CustomerDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { rows: depositLedger, summary: depositSummary } =
    await getCustomerDepositLedger(id);

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
    .select(
      "id, invoice_no, sale_date, total_amount, balance_due, deposit_applied"
    )
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
      deposit_applied: Number(s.deposit_applied ?? 0),
    })),
    depositLedger,
    depositSummary,
  };
}
