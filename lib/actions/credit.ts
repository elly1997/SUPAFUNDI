"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildCustomerPaymentJournalLines,
  buildDepositAppliedToCreditJournalLines,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { creditAccountFromPosSale } from "@/lib/actions/banking";
import { formatCustomerArReference } from "@/lib/constants/party-payments";
import { checkBusinessDayMutable } from "@/lib/server/business-day-guard";
import { requireOrgContext } from "@/lib/server/org-context";
import { resolveWorkingOutletId } from "@/lib/customers/working-outlet";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { listCustomerOpenInvoices } from "@/lib/actions/party-statements";
import type { CustomerOpenInvoice } from "@/lib/actions/party-statements";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function paymentsDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

type CreditSlice = { saleId: string; amount: number; invoiceNo: string };

function buildFifoCreditSlices(
  openInvoices: CustomerOpenInvoice[],
  amount: number
): CreditSlice[] {
  const slices: CreditSlice[] = [];
  let remaining = amount;
  for (const inv of openInvoices) {
    if (remaining <= 0) break;
    const slice = roundMoney(Math.min(remaining, inv.balanceDue));
    if (slice > 0) {
      slices.push({
        saleId: inv.saleId,
        amount: slice,
        invoiceNo: inv.invoiceNo,
      });
      remaining = roundMoney(remaining - slice);
    }
  }
  return slices;
}

/** Reduce customer AR by amount — FIFO on open invoices when available. */
export async function applyAmountToCustomerCredit(
  supabase: Supabase,
  ctx: Awaited<ReturnType<typeof requireOrgContext>>,
  params: {
    customerId: string;
    customerName: string;
    amount: number;
    currentOutstanding: number;
    entryDate: string;
    paymentTs?: string;
    outletId?: string;
    ledgerReferenceType: string;
    ledgerDescription: string;
    paymentMethod?: "cash" | "mpesa" | "bank_transfer";
    paymentReference?: string;
  }
): Promise<
  | { ok: true; applied: number; newOutstanding: number; ledgerId: string }
  | { ok: false; message: string }
> {
  const applied = roundMoney(
    Math.min(params.amount, params.currentOutstanding)
  );
  if (applied <= 0) {
    return {
      ok: true,
      applied: 0,
      newOutstanding: roundMoney(params.currentOutstanding),
      ledgerId: "",
    };
  }

  const openInvoices = await listCustomerOpenInvoices(params.customerId);
  const slices = buildFifoCreditSlices(openInvoices, applied);
  const paymentTs =
    params.paymentTs ?? `${params.entryDate}T12:00:00.000Z`;

  let newOutstanding = roundMoney(params.currentOutstanding);
  let lastLedgerId = "";

  for (const slice of slices) {
    const { data: sale } = await supabase
      .from("sales")
      .select("id, amount_paid, balance_due, invoice_no")
      .eq("id", slice.saleId)
      .eq("customer_id", params.customerId)
      .maybeSingle();
    if (!sale) {
      return { ok: false, message: "Sale not found." };
    }
    const newPaid = roundMoney(Number(sale.amount_paid) + slice.amount);
    const newDue = roundMoney(Number(sale.balance_due) - slice.amount);
    const { error: saleErr } = await supabase
      .from("sales")
      .update({
        amount_paid: newPaid,
        balance_due: Math.max(0, newDue),
      } as { amount_paid: number; balance_due: number })
      .eq("id", slice.saleId);
    if (saleErr) return { ok: false, message: saleErr.message };

    if (params.paymentMethod) {
      await paymentsDb(supabase).from("payments").insert({
        organization_id: ctx.organizationId,
        outlet_id: params.outletId ?? ctx.outletId,
        sale_id: slice.saleId,
        payment_method: params.paymentMethod,
        amount: slice.amount,
        reference_no:
          formatCustomerArReference(
            sale.invoice_no,
            params.paymentReference
          ),
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: params.customerId,
      });
    }

    newOutstanding = roundMoney(newOutstanding - slice.amount);

    const { data: ledger, error: ledgerErr } = await paymentsDb(supabase)
      .from("credit_ledger")
      .insert({
        organization_id: ctx.organizationId,
        customer_id: params.customerId,
        entry_type: "payment",
        reference_id: slice.saleId,
        reference_type: params.ledgerReferenceType,
        debit: 0,
        credit: slice.amount,
        balance: newOutstanding,
        description: params.ledgerDescription,
        entry_date: params.entryDate,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ledgerErr || !ledger) {
      return {
        ok: false,
        message: ledgerErr?.message ?? "Ledger insert failed",
      };
    }
    lastLedgerId = String(ledger.id);
  }

  const { error: custErr } = await supabase
    .from("customers")
    .update({ outstanding_balance: newOutstanding })
    .eq("id", params.customerId);
  if (custErr) {
    return { ok: false, message: custErr.message };
  }

  return {
    ok: true,
    applied,
    newOutstanding,
    ledgerId: lastLedgerId,
  };
}

export type CustomerBalanceRow = {
  id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
  credit_limit: number;
};

export type CustomerCreditSummary = {
  totalOutstanding: number;
  creditIssuedMonth: number;
  creditPaidMonth: number;
  monthLabel: string;
};

function currentMonthStart(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-TZ", {
    month: "long",
    year: "numeric",
  });
}

/** Lightweight AR aggregates for the customers hub (no full ledger scan). */
export async function getCustomerCreditSummary(): Promise<CustomerCreditSummary> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const outletId = await resolveWorkingOutletId(ctx);
  const monthStart = currentMonthStart();

  let customersQuery = supabase
    .from("customers")
    .select("id, outstanding_balance")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true);
  if (outletId) {
    customersQuery = customersQuery.eq("outlet_id", outletId);
  }

  const customersRes = await customersQuery;
  if (customersRes.error) throw new Error(customersRes.error.message);

  const customerIds = (customersRes.data ?? []).map((c) => c.id);
  const totalOutstanding = roundMoney(
    (customersRes.data ?? []).reduce(
      (s, c) => s + Number(c.outstanding_balance),
      0
    )
  );

  let creditIssuedMonth = 0;
  let creditPaidMonth = 0;
  if (customerIds.length > 0) {
    const ledgerRes = await supabase
      .from("credit_ledger")
      .select("entry_type, debit, credit")
      .eq("organization_id", ctx.organizationId)
      .in("customer_id", customerIds)
      .gte("entry_date", monthStart);
    if (ledgerRes.error) throw new Error(ledgerRes.error.message);

    for (const row of ledgerRes.data ?? []) {
      const debit = Number(row.debit) || 0;
      const credit = Number(row.credit) || 0;
      if (row.entry_type === "invoice" || row.entry_type === "adjustment") {
        creditIssuedMonth += debit;
      } else if (row.entry_type === "payment") {
        creditPaidMonth += credit;
      }
    }
  }

  return {
    totalOutstanding,
    creditIssuedMonth: roundMoney(creditIssuedMonth),
    creditPaidMonth: roundMoney(creditPaidMonth),
    monthLabel: currentMonthLabel(),
  };
}

export async function listCustomersWithBalance(): Promise<CustomerBalanceRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const outletId = await resolveWorkingOutletId(ctx);
  let query = supabase
    .from("customers")
    .select("id, name, phone, outstanding_balance, credit_limit")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .gt("outstanding_balance", 0)
    .order("outstanding_balance", { ascending: false });
  if (outletId) {
    query = query.eq("outlet_id", outletId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding_balance: Number(c.outstanding_balance),
    credit_limit: Number(c.credit_limit),
  }));
}

const allocationSchema = z.object({
  saleId: z.string().uuid(),
  amount: z.number().positive(),
});

const paymentInput = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]).default("cash"),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  payAll: z.boolean().optional(),
  allocations: z.array(allocationSchema).optional(),
});

/**
 * Retroactively apply held deposit to sales that were marked paid on account
 * without reducing deposit_balance (legacy POS bug). Idempotent.
 */
export async function repairCustomerDepositApplications(
  customerId: string
): Promise<{ ok: true; applied: number } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, deposit_balance")
      .eq("id", customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) {
      return { ok: false, message: "Customer not found." };
    }

    let availableDeposit = roundMoney(Number(customer.deposit_balance ?? 0));
    if (availableDeposit <= 0) {
      return { ok: true, applied: 0 };
    }

    const { data: sales, error: salesErr } = await supabase
      .from("sales")
      .select(
        "id, invoice_no, total_amount, amount_paid, balance_due, deposit_applied, sale_date"
      )
      .eq("customer_id", customerId)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "completed")
      .order("sale_date", { ascending: true });
    if (salesErr) {
      return { ok: false, message: salesErr.message };
    }

    let totalApplied = 0;

    for (const sale of sales ?? []) {
      if (availableDeposit <= 0) break;

      const total = roundMoney(Number(sale.total_amount));
      const depositApplied = roundMoney(Number(sale.deposit_applied ?? 0));
      const balanceDue = roundMoney(Number(sale.balance_due));

      const { data: payRows } = await supabase
        .from("payments")
        .select("id, amount, payment_method, reference_no")
        .eq("sale_id", sale.id)
        .eq("status", "completed");

      const realCash = roundMoney(
        (payRows ?? [])
          .filter((p) => {
            const method = String(p.payment_method);
            const ref = String(p.reference_no ?? "");
            return method !== "credit_account" && !ref.startsWith("DEP-");
          })
          .reduce((s, p) => s + Number(p.amount), 0)
      );

      let unsettled = roundMoney(total - realCash - depositApplied);
      if (balanceDue > unsettled) {
        unsettled = balanceDue;
      }
      if (unsettled <= 0) continue;

      const toApply = roundMoney(Math.min(availableDeposit, unsettled));
      if (toApply <= 0) continue;

      const newDepositApplied = roundMoney(depositApplied + toApply);
      const newAmountPaid = roundMoney(realCash + newDepositApplied);
      const newBalanceDue = roundMoney(Math.max(0, total - newAmountPaid));

      let creditToRemove = toApply;
      for (const row of payRows ?? []) {
        if (creditToRemove <= 0) break;
        if (String(row.payment_method) !== "credit_account") continue;
        const amt = roundMoney(Number(row.amount));
        if (amt <= creditToRemove) {
          const { error: delErr } = await supabase
            .from("payments")
            .delete()
            .eq("id", row.id);
          if (delErr) return { ok: false, message: delErr.message };
          creditToRemove = roundMoney(creditToRemove - amt);
        } else {
          const { error: updErr } = await paymentsDb(supabase)
            .from("payments")
            .update({ amount: roundMoney(amt - creditToRemove) })
            .eq("id", row.id);
          if (updErr) return { ok: false, message: updErr.message };
          creditToRemove = 0;
        }
      }

      const { error: saleErr } = await paymentsDb(supabase)
        .from("sales")
        .update({
          deposit_applied: newDepositApplied,
          amount_paid: newAmountPaid,
          balance_due: newBalanceDue,
        })
        .eq("id", sale.id);
      if (saleErr) return { ok: false, message: saleErr.message };

      availableDeposit = roundMoney(availableDeposit - toApply);
      totalApplied = roundMoney(totalApplied + toApply);
    }

    if (totalApplied > 0) {
      const { data: openSales, error: openErr } = await supabase
        .from("sales")
        .select("balance_due")
        .eq("customer_id", customerId)
        .eq("organization_id", ctx.organizationId)
        .eq("status", "completed")
        .gt("balance_due", 0);
      if (openErr) return { ok: false, message: openErr.message };

      const newOutstanding = roundMoney(
        (openSales ?? []).reduce((s, row) => s + Number(row.balance_due), 0)
      );

      const { error: custErr } = await supabase
        .from("customers")
        .update({
          deposit_balance: availableDeposit,
          outstanding_balance: newOutstanding,
        })
        .eq("id", customerId);
      if (custErr) return { ok: false, message: custErr.message };

      revalidatePath("/customers");
      revalidatePath(`/customers/${customerId}`);
      revalidatePath("/finance/credit");
      revalidatePath("/pos");
      revalidatePath("/sales");
    }

    return { ok: true, applied: totalApplied };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Deposit repair failed",
    };
  }
}

/** Repair mis-recorded sales then apply remaining deposit to open credit (FIFO). */
export async function syncCustomerDeposits(customerId: string): Promise<void> {
  const repair = await repairCustomerDepositApplications(customerId);
  if (!repair.ok) {
    console.warn(
      `Deposit repair skipped for customer ${customerId}: ${repair.message}`
    );
  }
  const apply = await applyCustomerDepositToCredit(customerId);
  if (!apply.ok) {
    console.warn(
      `Deposit apply skipped for customer ${customerId}: ${apply.message}`
    );
  }
}

/** Apply held deposits against open customer credit (FIFO). Safe to call repeatedly. */
export async function syncCustomersWithDepositAndCredit(): Promise<void> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .gt("deposit_balance", 0);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    await syncCustomerDeposits(row.id);
  }
}

/** Net deposit balance against open credit when both exist (FIFO invoice allocation). */
export async function applyCustomerDepositToCredit(
  customerId: string,
  options?: { outletId?: string; entryDate?: string }
): Promise<
  { ok: true; applied: number } | { ok: false; message: string }
> {
  try {
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const entryDate =
      options?.entryDate ?? new Date().toISOString().slice(0, 10);

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, outstanding_balance, deposit_balance")
      .eq("id", customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) {
      return { ok: false, message: "Customer not found." };
    }

    const outstanding = roundMoney(Number(customer.outstanding_balance ?? 0));
    const deposit = roundMoney(Number(customer.deposit_balance ?? 0));
    const applyAmount = roundMoney(Math.min(outstanding, deposit));
    if (applyAmount <= 0) {
      return { ok: true, applied: 0 };
    }

    const openInvoices = await listCustomerOpenInvoices(customerId);
    const slices = buildFifoCreditSlices(openInvoices, applyAmount);

    let newOutstanding = outstanding;
    let newDeposit = deposit;
    let totalApplied = 0;
    const ledgerIds: string[] = [];

    for (const slice of slices) {
      const { data: sale } = await supabase
        .from("sales")
        .select("id, amount_paid, balance_due, deposit_applied, invoice_no")
        .eq("id", slice.saleId)
        .eq("customer_id", customerId)
        .maybeSingle();
      if (!sale) {
        return { ok: false, message: "Sale not found." };
      }
      const newPaid = roundMoney(Number(sale.amount_paid) + slice.amount);
      const newDue = roundMoney(Number(sale.balance_due) - slice.amount);
      const newDepositApplied = roundMoney(
        Number(sale.deposit_applied ?? 0) + slice.amount
      );
      const { error: saleErr } = await paymentsDb(supabase)
        .from("sales")
        .update({
          amount_paid: newPaid,
          balance_due: Math.max(0, newDue),
          deposit_applied: newDepositApplied,
        })
        .eq("id", slice.saleId);
      if (saleErr) return { ok: false, message: saleErr.message };

      newOutstanding = roundMoney(newOutstanding - slice.amount);
      newDeposit = roundMoney(newDeposit - slice.amount);
      totalApplied = roundMoney(totalApplied + slice.amount);

      const { data: ledger, error: ledgerErr } = await paymentsDb(supabase)
        .from("credit_ledger")
        .insert({
          organization_id: ctx.organizationId,
          customer_id: customerId,
          entry_type: "payment",
          reference_id: slice.saleId,
          reference_type: "deposit_applied",
          debit: 0,
          credit: slice.amount,
          balance: newOutstanding,
          description: `Deposit applied to ${sale.invoice_no}`,
          entry_date: entryDate,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (ledgerErr || !ledger) {
        return {
          ok: false,
          message: ledgerErr?.message ?? "Ledger insert failed",
        };
      }
      ledgerIds.push(String(ledger.id));
    }

    if (totalApplied <= 0) {
      return { ok: true, applied: 0 };
    }

    const { data: custUpdated, error: custErr } = await supabase
      .from("customers")
      .update({
        outstanding_balance: newOutstanding,
        deposit_balance: Math.max(0, newDeposit),
      })
      .eq("id", customerId)
      .gte("deposit_balance", totalApplied)
      .select("id")
      .maybeSingle();
    if (custErr) {
      return { ok: false, message: custErr.message };
    }
    if (!custUpdated) {
      for (const id of ledgerIds) {
        await supabase.from("credit_ledger").delete().eq("id", id);
      }
      return {
        ok: false,
        message:
          "Deposit balance changed concurrently. Refresh and try again.",
      };
    }

    const journal = await postJournalEntry({
      description: `Deposit applied to credit — ${customer.name}`,
      sourceType: "payment",
      sourceId: ledgerIds[0],
      outletId: options?.outletId ?? ctx.outletId ?? undefined,
      entryDate,
      lines: buildDepositAppliedToCreditJournalLines(totalApplied),
    });
    if (!journal.ok) {
      await supabase
        .from("customers")
        .update({
          outstanding_balance: outstanding,
          deposit_balance: deposit,
        })
        .eq("id", customerId);
      for (const id of ledgerIds) {
        await supabase.from("credit_ledger").delete().eq("id", id);
      }
      return { ok: false, message: journal.message };
    }

    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/finance/credit");
    revalidatePath("/pos");
    return { ok: true, applied: totalApplied };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Deposit apply failed",
    };
  }
}

export async function recordCustomerPayment(
  raw: z.infer<typeof paymentInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = paymentInput.parse(raw);
    if (
      (input.paymentMethod === "mpesa" ||
        input.paymentMethod === "bank_transfer") &&
      !input.bankAccountId
    ) {
      return {
        ok: false,
        message: "Select the M-Pesa or bank account that received this payment.",
      };
    }
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const paymentDate =
      input.paymentDate ?? new Date().toISOString().slice(0, 10);
    const dayCheck = await checkBusinessDayMutable(ctx.outletId, paymentDate);
    if (!dayCheck.ok) return dayCheck;
    if (!ctx.outletId) {
      return {
        ok: false,
        message: "Select a working outlet before recording a customer payment.",
      };
    }
    const paymentTs = `${paymentDate}T12:00:00.000Z`;

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, outstanding_balance, outlet_id")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) {
      return { ok: false, message: "Customer not found." };
    }
    if (customer.outlet_id && customer.outlet_id !== ctx.outletId) {
      return {
        ok: false,
        message:
          "This customer belongs to another outlet. Switch branch before recording payment.",
      };
    }

    const openInvoices = await listCustomerOpenInvoices(input.customerId);
    let slices: { saleId: string; amount: number }[] = [];

    if (input.payAll) {
      const totalDue = roundMoney(
        openInvoices.reduce((s, i) => s + i.balanceDue, 0)
      );
      if (roundMoney(input.amount) !== totalDue) {
        return {
          ok: false,
          message: `Pay-all requires ${totalDue} (open invoices total).`,
        };
      }
      slices = openInvoices.map((i) => ({
        saleId: i.saleId,
        amount: i.balanceDue,
      }));
    } else if (input.allocations?.length) {
      const allocTotal = roundMoney(
        input.allocations.reduce((s, a) => s + a.amount, 0)
      );
      if (allocTotal !== roundMoney(input.amount)) {
        return {
          ok: false,
          message: "Allocation amounts must equal payment amount.",
        };
      }
      for (const a of input.allocations) {
        const inv = openInvoices.find((i) => i.saleId === a.saleId);
        if (!inv) {
          return { ok: false, message: "Invoice not open or not found." };
        }
        if (a.amount > inv.balanceDue) {
          return {
            ok: false,
            message: `Amount exceeds due on ${inv.invoiceNo}.`,
          };
        }
        slices.push(a);
      }
    } else {
      let remaining = input.amount;
      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const slice = roundMoney(Math.min(remaining, inv.balanceDue));
        if (slice > 0) {
          slices.push({ saleId: inv.saleId, amount: slice });
          remaining = roundMoney(remaining - slice);
        }
      }
      if (remaining > 0) {
        return {
          ok: false,
          message: `Payment exceeds open invoices by ${remaining}.`,
        };
      }
    }

    const owed = Number(customer.outstanding_balance);
    if (input.amount > owed) {
      return {
        ok: false,
        message: `Payment exceeds balance (${owed}).`,
      };
    }

    for (const slice of slices) {
      const { data: sale } = await supabase
        .from("sales")
        .select("id, amount_paid, balance_due, invoice_no")
        .eq("id", slice.saleId)
        .eq("customer_id", input.customerId)
        .maybeSingle();
      if (!sale) {
        return { ok: false, message: "Sale not found." };
      }
      const newPaid = roundMoney(Number(sale.amount_paid) + slice.amount);
      const newDue = roundMoney(Number(sale.balance_due) - slice.amount);
      const { error: saleErr } = await supabase
        .from("sales")
        .update({
          amount_paid: newPaid,
          balance_due: Math.max(0, newDue),
        } as { amount_paid: number; balance_due: number })
        .eq("id", slice.saleId);
      if (saleErr) return { ok: false, message: saleErr.message };

      await paymentsDb(supabase).from("payments").insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        sale_id: slice.saleId,
        payment_method: input.paymentMethod,
        amount: slice.amount,
        reference_no: formatCustomerArReference(
          sale.invoice_no,
          input.referenceNo
        ),
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: input.customerId,
      });
    }

    const newBalance = roundMoney(owed - input.amount);
    const { data: ledger, error: ledgerErr } = await paymentsDb(supabase)
      .from("credit_ledger")
      .insert({
        organization_id: ctx.organizationId,
        customer_id: input.customerId,
        entry_type: "payment",
        reference_type: "customer_payment",
        debit: 0,
        credit: input.amount,
        balance: newBalance,
        description:
          input.notes?.trim() ||
          `Payment received — ${input.referenceNo ?? input.paymentMethod}`,
        entry_date: paymentDate,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ledgerErr || !ledger) {
      return { ok: false, message: ledgerErr?.message ?? "Ledger insert failed" };
    }

    if (slices.length === 0) {
      await paymentsDb(supabase).from("payments").insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        payment_method: input.paymentMethod,
        amount: input.amount,
        reference_no: formatCustomerArReference(
          customer.name,
          input.referenceNo
        ),
        status: "completed",
        payment_date: paymentTs,
        received_by: ctx.userId,
        customer_id: input.customerId,
      });
    }

    const { error: custErr } = await supabase
      .from("customers")
      .update({ outstanding_balance: newBalance })
      .eq("id", input.customerId);
    if (custErr) {
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: custErr.message };
    }

    const journal = await postJournalEntry({
      description: `Customer payment — ${customer.name}`,
      sourceType: "payment",
      sourceId: ledger.id,
      outletId: ctx.outletId ?? undefined,
      entryDate: paymentDate,
      lines: buildCustomerPaymentJournalLines(
        input.amount,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      await supabase
        .from("customers")
        .update({ outstanding_balance: owed })
        .eq("id", input.customerId);
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
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
        ledger.id,
        formatCustomerArReference(customer.name, input.referenceNo),
        paymentDate,
        `Customer payment — ${customer.name}`
      );
      if (!bank.ok) return bank;
    }

    revalidatePath("/finance/credit");
    revalidatePath("/customers");
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
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
