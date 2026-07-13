"use server";

import { revalidatePath } from "next/cache";
import { resolveExpenseAccountCode } from "@/lib/accounting/expense-coa";
import {
  buildCustomerDepositReceiptJournalLines,
  buildCustomerPaymentJournalLines,
  buildExpenseJournalLines,
  buildGrnJournalLines,
  buildSaleJournalLines,
  buildSupplierPaymentJournalLines,
  type JournalLineInput,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";
import { businessDateFromTimestamptz } from "@/lib/utils/iso-date";

export type GlPostingGaps = {
  fromDate: string | null;
  toDate: string | null;
  completedSales: number;
  salesWithJournal: number;
  salesMissingJournal: number;
  expenses: number;
  expensesWithJournal: number;
  expensesMissingJournal: number;
  grns: number;
  grnsWithJournal: number;
  grnsMissingJournal: number;
  customerPayments: number;
  customerPaymentsWithJournal: number;
  customerPaymentsMissingJournal: number;
  customerDeposits: number;
  customerDepositsWithJournal: number;
  customerDepositsMissingJournal: number;
  supplierPayments: number;
  supplierPaymentsWithJournal: number;
  supplierPaymentsMissingJournal: number;
  /** Unposted sales net revenue approximation (subtotal − discount). */
  missingSalesNetApprox: number;
  missingExpensesTotal: number;
};

export type GlBackfillResult = {
  ok: true;
  salesPosted: number;
  expensesPosted: number;
  grnsPosted: number;
  customerPaymentsPosted: number;
  customerDepositsPosted: number;
  supplierPaymentsPosted: number;
  salesSkipped: number;
  expensesSkipped: number;
  errors: string[];
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;
type JournalSourceType = "sale" | "expense" | "grn" | "payment";

async function postedSourceIds(
  supabase: Supabase,
  organizationId: string,
  sourceType: JournalSourceType,
  sourceIds: string[]
): Promise<Set<string>> {
  if (sourceIds.length === 0) return new Set();
  const rows = await fetchByInChunks(sourceIds, async (chunk) => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("source_id")
      .eq("organization_id", organizationId)
      .eq("source_type", sourceType)
      .eq("is_posted", true)
      .in("source_id", chunk);
    return { data, error };
  });
  return new Set(
    rows.map((r) => r.source_id).filter((id): id is string => Boolean(id))
  );
}

function countPostedMissing<T extends { id: string }>(
  rows: T[],
  posted: Set<string>
): { withJournal: number; missing: number } {
  let withJournal = 0;
  let missing = 0;
  for (const row of rows) {
    if (posted.has(row.id)) withJournal += 1;
    else missing += 1;
  }
  return { withJournal, missing };
}

async function sumCogsForSale(
  supabase: Supabase,
  organizationId: string,
  saleId: string
): Promise<number> {
  const { data } = await supabase
    .from("stock_movements")
    .select("quantity, unit_cost")
    .eq("organization_id", organizationId)
    .eq("movement_type", "sale")
    .eq("reference_type", "sale")
    .eq("reference_id", saleId);
  return roundMoney(
    (data ?? []).reduce(
      (sum, row) =>
        sum + Math.abs(Number(row.quantity)) * Number(row.unit_cost ?? 0),
      0
    )
  );
}

function reconstructSurcharge(sale: {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
}): number {
  const implied = roundMoney(
    Number(sale.total_amount) -
      Number(sale.tax_amount) -
      (Number(sale.subtotal) - Number(sale.discount_amount))
  );
  return implied > 0.01 ? implied : 0;
}

type SalePaymentMethod =
  | "cash"
  | "mpesa"
  | "card"
  | "bank_transfer"
  | "credit_account"
  | "cheque"
  | "loyalty_points";

function coercePaymentMethod(raw: string | null | undefined): SalePaymentMethod {
  const allowed: SalePaymentMethod[] = [
    "cash",
    "mpesa",
    "card",
    "bank_transfer",
    "credit_account",
    "cheque",
    "loyalty_points",
  ];
  if (raw && (allowed as string[]).includes(raw)) {
    return raw as SalePaymentMethod;
  }
  return "cash";
}

function coerceCashMethod(
  raw: string | null | undefined
): "cash" | "mpesa" | "bank_transfer" {
  if (raw === "mpesa" || raw === "bank_transfer") return raw;
  return "cash";
}

function coerceSupplierPayMethod(
  raw: string | null | undefined
): "cash" | "mpesa" | "bank_transfer" | "cheque" {
  if (raw === "mpesa" || raw === "bank_transfer" || raw === "cheque") return raw;
  return "cash";
}

function coerceGrnPayMethod(
  raw: string | null | undefined
): "cash" | "mpesa" | "bank_transfer" | "on_account" {
  if (
    raw === "cash" ||
    raw === "mpesa" ||
    raw === "bank_transfer" ||
    raw === "on_account"
  ) {
    return raw;
  }
  return "on_account";
}

async function buildSaleLinesFromRecord(
  supabase: Supabase,
  organizationId: string,
  sale: {
    id: string;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    deposit_applied: number | null;
  }
): Promise<{ lines: JournalLineInput[]; paymentMethod: SalePaymentMethod }> {
  const depositApplied = roundMoney(Number(sale.deposit_applied ?? 0));
  const balanceDue = roundMoney(Number(sale.balance_due));
  const cashAmountPaid = roundMoney(
    Math.max(0, Number(sale.amount_paid) - depositApplied)
  );

  const { data: payments } = await supabase
    .from("payments")
    .select("payment_method, amount, status")
    .eq("sale_id", sale.id)
    .neq("status", "reversed");

  const primaryPay = (payments ?? []).find(
    (p) => Number(p.amount) > 0 && p.status !== "failed"
  );
  const paymentMethod: SalePaymentMethod =
    balanceDue > 0 && cashAmountPaid === 0 && depositApplied === 0
      ? "credit_account"
      : coercePaymentMethod(primaryPay?.payment_method);

  const cogsAmount = await sumCogsForSale(supabase, organizationId, sale.id);
  const surchargeAmount = reconstructSurcharge(sale);

  return {
    paymentMethod,
    lines: buildSaleJournalLines({
      subtotal: Number(sale.subtotal),
      discountAmount: Number(sale.discount_amount),
      surchargeAmount,
      taxAmount: Number(sale.tax_amount),
      totalAmount: Number(sale.total_amount),
      cashAmountPaid,
      depositApplied,
      balanceDue,
      paymentMethod,
      cogsAmount,
    }),
  };
}

/** Count operational rows missing posted journals (optionally in a date range). */
export async function getGlPostingGaps(
  fromDate?: string,
  toDate?: string
): Promise<GlPostingGaps> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const sales = await fetchAllPaginated<{
    id: string;
    subtotal: number;
    discount_amount: number;
  }>(async (from, to) => {
    let q = supabase
      .from("sales")
      .select("id, subtotal, discount_amount")
      .eq("organization_id", ctx.organizationId)
      .eq("status", "completed")
      .order("sale_date", { ascending: true })
      .range(from, to);
    if (fromDate) q = q.gte("sale_date", `${fromDate}T00:00:00.000Z`);
    if (toDate) q = q.lte("sale_date", `${toDate}T23:59:59.999Z`);
    return q;
  });

  const expenses = await fetchAllPaginated<{ id: string; amount: number }>(
    async (from, to) => {
      let q = supabase
        .from("expenses")
        .select("id, amount")
        .eq("organization_id", ctx.organizationId)
        .order("expense_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("expense_date", fromDate);
      if (toDate) q = q.lte("expense_date", toDate);
      return q;
    }
  );

  const grns = await fetchAllPaginated<{ id: string }>(async (from, to) => {
    let q = supabase
      .from("grns")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .order("received_date", { ascending: true })
      .range(from, to);
    if (fromDate) q = q.gte("received_date", fromDate);
    if (toDate) q = q.lte("received_date", toDate);
    return q;
  });

  const customerPayments = await fetchAllPaginated<{ id: string }>(
    async (from, to) => {
      let q = supabase
        .from("credit_ledger")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("entry_type", "payment")
        .eq("reference_type", "customer_payment")
        .order("entry_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("entry_date", fromDate);
      if (toDate) q = q.lte("entry_date", toDate);
      return q;
    }
  );

  const customerDeposits = await fetchAllPaginated<{ id: string }>(
    async (from, to) => {
      let q = supabase
        .from("payments")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .not("customer_id", "is", null)
        .is("sale_id", null)
        .eq("status", "completed")
        .ilike("reference_no", "DEP-%")
        .order("payment_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("payment_date", `${fromDate}T00:00:00.000Z`);
      if (toDate) q = q.lte("payment_date", `${toDate}T23:59:59.999Z`);
      return q;
    }
  );

  const supplierPayments = await fetchAllPaginated<{ id: string }>(
    async (from, to) => {
      let q = supabase
        .from("supplier_payments")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .order("payment_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("payment_date", fromDate);
      if (toDate) q = q.lte("payment_date", toDate);
      return q;
    }
  );

  const [
    salePosted,
    expensePosted,
    grnPosted,
    customerPayPosted,
    depositPosted,
    supplierPayPosted,
  ] = await Promise.all([
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "sale",
      sales.map((s) => s.id)
    ),
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "expense",
      expenses.map((e) => e.id)
    ),
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "grn",
      grns.map((g) => g.id)
    ),
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "payment",
      customerPayments.map((p) => p.id)
    ),
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "payment",
      customerDeposits.map((p) => p.id)
    ),
    postedSourceIds(
      supabase,
      ctx.organizationId,
      "payment",
      supplierPayments.map((p) => p.id)
    ),
  ]);

  let missingSalesNetApprox = 0;
  let salesMissing = 0;
  let salesWithJournal = 0;
  for (const s of sales) {
    if (salePosted.has(s.id)) {
      salesWithJournal += 1;
      continue;
    }
    salesMissing += 1;
    missingSalesNetApprox += Number(s.subtotal) - Number(s.discount_amount);
  }

  let missingExpensesTotal = 0;
  let expensesMissing = 0;
  let expensesWithJournal = 0;
  for (const e of expenses) {
    if (expensePosted.has(e.id)) {
      expensesWithJournal += 1;
      continue;
    }
    expensesMissing += 1;
    missingExpensesTotal += Number(e.amount);
  }

  const grnCounts = countPostedMissing(grns, grnPosted);
  const customerPayCounts = countPostedMissing(
    customerPayments,
    customerPayPosted
  );
  const depositCounts = countPostedMissing(customerDeposits, depositPosted);
  const supplierPayCounts = countPostedMissing(
    supplierPayments,
    supplierPayPosted
  );

  return {
    fromDate: fromDate ?? null,
    toDate: toDate ?? null,
    completedSales: sales.length,
    salesWithJournal,
    salesMissingJournal: salesMissing,
    expenses: expenses.length,
    expensesWithJournal,
    expensesMissingJournal: expensesMissing,
    grns: grns.length,
    grnsWithJournal: grnCounts.withJournal,
    grnsMissingJournal: grnCounts.missing,
    customerPayments: customerPayments.length,
    customerPaymentsWithJournal: customerPayCounts.withJournal,
    customerPaymentsMissingJournal: customerPayCounts.missing,
    customerDeposits: customerDeposits.length,
    customerDepositsWithJournal: depositCounts.withJournal,
    customerDepositsMissingJournal: depositCounts.missing,
    supplierPayments: supplierPayments.length,
    supplierPaymentsWithJournal: supplierPayCounts.withJournal,
    supplierPaymentsMissingJournal: supplierPayCounts.missing,
    missingSalesNetApprox: roundMoney(missingSalesNetApprox),
    missingExpensesTotal: roundMoney(missingExpensesTotal),
  };
}

/**
 * Post missing journals for sales, expenses, GRNs, customer AR/deposits, and
 * supplier payments. Manager-only. Idempotent.
 */
export async function backfillMissingGlJournals(
  fromDate?: string,
  toDate?: string,
  limit = 200
): Promise<GlBackfillResult | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const batchLimit = Math.min(Math.max(limit, 1), 500);

    const sales = await fetchAllPaginated<{
      id: string;
      invoice_no: string;
      outlet_id: string | null;
      sale_date: string;
      subtotal: number;
      discount_amount: number;
      tax_amount: number;
      total_amount: number;
      amount_paid: number;
      balance_due: number;
      deposit_applied: number | null;
    }>(async (from, to) => {
      let q = supabase
        .from("sales")
        .select(
          "id, invoice_no, outlet_id, sale_date, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, deposit_applied"
        )
        .eq("organization_id", ctx.organizationId)
        .eq("status", "completed")
        .order("sale_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("sale_date", `${fromDate}T00:00:00.000Z`);
      if (toDate) q = q.lte("sale_date", `${toDate}T23:59:59.999Z`);
      return q;
    });

    const expenses = await fetchAllPaginated<{
      id: string;
      outlet_id: string | null;
      category: string;
      description: string | null;
      amount: number;
      payment_method: string | null;
      expense_date: string;
    }>(async (from, to) => {
      let q = supabase
        .from("expenses")
        .select(
          "id, outlet_id, category, description, amount, payment_method, expense_date"
        )
        .eq("organization_id", ctx.organizationId)
        .order("expense_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("expense_date", fromDate);
      if (toDate) q = q.lte("expense_date", toDate);
      return q;
    });

    const grns = await fetchAllPaginated<{
      id: string;
      outlet_id: string | null;
      reference_no: string | null;
      received_date: string;
      subtotal: number;
      tax_amount: number;
      payment_method: string | null;
    }>(async (from, to) => {
      let q = supabase
        .from("grns")
        .select(
          "id, outlet_id, reference_no, received_date, subtotal, tax_amount, payment_method"
        )
        .eq("organization_id", ctx.organizationId)
        .order("received_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("received_date", fromDate);
      if (toDate) q = q.lte("received_date", toDate);
      return q;
    });

    const arLedgers = await fetchAllPaginated<{
      id: string;
      credit: number;
      entry_date: string | null;
      description: string | null;
      customer_id: string;
    }>(async (from, to) => {
      let q = supabase
        .from("credit_ledger")
        .select("id, credit, entry_date, description, customer_id")
        .eq("organization_id", ctx.organizationId)
        .eq("entry_type", "payment")
        .eq("reference_type", "customer_payment")
        .order("entry_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("entry_date", fromDate);
      if (toDate) q = q.lte("entry_date", toDate);
      return q;
    });

    const deposits = await fetchAllPaginated<{
      id: string;
      outlet_id: string | null;
      amount: number;
      payment_method: string;
      payment_date: string;
      reference_no: string | null;
      customer_id: string | null;
    }>(async (from, to) => {
      let q = supabase
        .from("payments")
        .select(
          "id, outlet_id, amount, payment_method, payment_date, reference_no, customer_id"
        )
        .eq("organization_id", ctx.organizationId)
        .not("customer_id", "is", null)
        .is("sale_id", null)
        .eq("status", "completed")
        .ilike("reference_no", "DEP-%")
        .order("payment_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("payment_date", `${fromDate}T00:00:00.000Z`);
      if (toDate) q = q.lte("payment_date", `${toDate}T23:59:59.999Z`);
      return q;
    });

    const supplierPays = await fetchAllPaginated<{
      id: string;
      outlet_id: string | null;
      amount: number;
      payment_method: string | null;
      payment_date: string;
      reference_no: string | null;
    }>(async (from, to) => {
      let q = supabase
        .from("supplier_payments")
        .select(
          "id, outlet_id, amount, payment_method, payment_date, reference_no"
        )
        .eq("organization_id", ctx.organizationId)
        .order("payment_date", { ascending: true })
        .range(from, to);
      if (fromDate) q = q.gte("payment_date", fromDate);
      if (toDate) q = q.lte("payment_date", toDate);
      return q;
    });

    const [
      salePosted,
      expensePosted,
      grnPosted,
      arPosted,
      depositPosted,
      supplierPosted,
    ] = await Promise.all([
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "sale",
        sales.map((s) => s.id)
      ),
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "expense",
        expenses.map((e) => e.id)
      ),
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "grn",
        grns.map((g) => g.id)
      ),
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "payment",
        arLedgers.map((l) => l.id)
      ),
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "payment",
        deposits.map((d) => d.id)
      ),
      postedSourceIds(
        supabase,
        ctx.organizationId,
        "payment",
        supplierPays.map((p) => p.id)
      ),
    ]);

    const errors: string[] = [];
    let salesPosted = 0;
    let expensesPosted = 0;
    let grnsPosted = 0;
    let customerPaymentsPosted = 0;
    let customerDepositsPosted = 0;
    let supplierPaymentsPosted = 0;
    let salesSkipped = 0;
    let expensesSkipped = 0;
    let remaining = batchLimit;

    for (const sale of sales) {
      if (remaining <= 0) break;
      if (salePosted.has(sale.id)) {
        salesSkipped += 1;
        continue;
      }
      try {
        const { lines } = await buildSaleLinesFromRecord(
          supabase,
          ctx.organizationId,
          sale
        );
        const journal = await postJournalEntry({
          description: `Backfill POS sale ${sale.invoice_no}`,
          sourceType: "sale",
          sourceId: sale.id,
          outletId: sale.outlet_id ?? undefined,
          entryDate: businessDateFromTimestamptz(String(sale.sale_date)),
          lines,
        });
        if (!journal.ok) {
          errors.push(`${sale.invoice_no}: ${journal.message}`);
          continue;
        }
        salesPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `${sale.invoice_no}: ${e instanceof Error ? e.message : "failed"}`
        );
      }
    }

    for (const expense of expenses) {
      if (remaining <= 0) break;
      if (expensePosted.has(expense.id)) {
        expensesSkipped += 1;
        continue;
      }
      try {
        const accountCode = await resolveExpenseAccountCode(expense.category);
        const paymentMethod =
          expense.payment_method === "mpesa" ||
          expense.payment_method === "bank_transfer" ||
          expense.payment_method === "on_account"
            ? expense.payment_method
            : "cash";
        const journal = await postJournalEntry({
          description: `Backfill expense: ${expense.category}${
            expense.description ? ` — ${expense.description}` : ""
          }`.trim(),
          sourceType: "expense",
          sourceId: expense.id,
          outletId: expense.outlet_id ?? undefined,
          entryDate: String(expense.expense_date).slice(0, 10),
          lines: buildExpenseJournalLines({
            amount: Number(expense.amount),
            paymentMethod,
            categoryAccountCode: accountCode,
          }),
        });
        if (!journal.ok) {
          errors.push(`Expense ${expense.id.slice(0, 8)}: ${journal.message}`);
          continue;
        }
        expensesPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `Expense ${expense.id.slice(0, 8)}: ${
            e instanceof Error ? e.message : "failed"
          }`
        );
      }
    }

    for (const grn of grns) {
      if (remaining <= 0) break;
      if (grnPosted.has(grn.id)) continue;
      try {
        const ref = grn.reference_no ?? grn.id.slice(0, 8);
        const journal = await postJournalEntry({
          description: `Backfill GRN ${ref}`,
          sourceType: "grn",
          sourceId: grn.id,
          outletId: grn.outlet_id ?? undefined,
          entryDate: String(grn.received_date).slice(0, 10),
          lines: buildGrnJournalLines({
            inventoryValue: Number(grn.subtotal),
            taxAmount: Number(grn.tax_amount),
            paymentMethod: coerceGrnPayMethod(grn.payment_method),
          }),
        });
        if (!journal.ok) {
          errors.push(`GRN ${ref}: ${journal.message}`);
          continue;
        }
        grnsPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `GRN ${grn.id.slice(0, 8)}: ${
            e instanceof Error ? e.message : "failed"
          }`
        );
      }
    }

    for (const ledger of arLedgers) {
      if (remaining <= 0) break;
      if (arPosted.has(ledger.id)) continue;
      const amount = Number(ledger.credit);
      if (amount <= 0) continue;
      try {
        // Reconstruct method from linked payment on same day / customer if any
        const entryDate = String(ledger.entry_date ?? "").slice(0, 10);
        let method: "cash" | "mpesa" | "bank_transfer" = "cash";
        if (entryDate) {
          const { data: linked } = await supabase
            .from("payments")
            .select("payment_method")
            .eq("organization_id", ctx.organizationId)
            .eq("customer_id", ledger.customer_id)
            .not("sale_id", "is", null)
            .gte("payment_date", `${entryDate}T00:00:00.000Z`)
            .lte("payment_date", `${entryDate}T23:59:59.999Z`)
            .limit(1)
            .maybeSingle();
          method = coerceCashMethod(linked?.payment_method);
        }
        const journal = await postJournalEntry({
          description: `Backfill customer payment — ${
            ledger.description ?? ledger.id.slice(0, 8)
          }`,
          sourceType: "payment",
          sourceId: ledger.id,
          entryDate: entryDate || undefined,
          lines: buildCustomerPaymentJournalLines(amount, method),
        });
        if (!journal.ok) {
          errors.push(`AR payment ${ledger.id.slice(0, 8)}: ${journal.message}`);
          continue;
        }
        customerPaymentsPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `AR payment ${ledger.id.slice(0, 8)}: ${
            e instanceof Error ? e.message : "failed"
          }`
        );
      }
    }

    for (const deposit of deposits) {
      if (remaining <= 0) break;
      if (depositPosted.has(deposit.id)) continue;
      try {
        const amount = Number(deposit.amount);
        if (amount <= 0) continue;
        // Without historical outstanding split, treat full amount as deposit liability
        const journal = await postJournalEntry({
          description: `Backfill customer deposit ${deposit.reference_no ?? ""}`.trim(),
          sourceType: "payment",
          sourceId: deposit.id,
          outletId: deposit.outlet_id ?? undefined,
          entryDate: businessDateFromTimestamptz(String(deposit.payment_date)),
          lines: buildCustomerDepositReceiptJournalLines(
            amount,
            0,
            amount,
            coerceCashMethod(deposit.payment_method)
          ),
        });
        if (!journal.ok) {
          errors.push(
            `Deposit ${deposit.reference_no ?? deposit.id.slice(0, 8)}: ${journal.message}`
          );
          continue;
        }
        customerDepositsPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `Deposit ${deposit.id.slice(0, 8)}: ${
            e instanceof Error ? e.message : "failed"
          }`
        );
      }
    }

    for (const pay of supplierPays) {
      if (remaining <= 0) break;
      if (supplierPosted.has(pay.id)) continue;
      try {
        const amount = Number(pay.amount);
        if (amount <= 0) continue;
        const journal = await postJournalEntry({
          description: `Backfill supplier payment${
            pay.reference_no ? ` ${pay.reference_no}` : ""
          }`,
          sourceType: "payment",
          sourceId: pay.id,
          outletId: pay.outlet_id ?? undefined,
          entryDate: String(pay.payment_date).slice(0, 10),
          lines: buildSupplierPaymentJournalLines(
            amount,
            coerceSupplierPayMethod(pay.payment_method)
          ),
        });
        if (!journal.ok) {
          errors.push(
            `Supplier pay ${pay.id.slice(0, 8)}: ${journal.message}`
          );
          continue;
        }
        supplierPaymentsPosted += 1;
        remaining -= 1;
      } catch (e) {
        errors.push(
          `Supplier pay ${pay.id.slice(0, 8)}: ${
            e instanceof Error ? e.message : "failed"
          }`
        );
      }
    }

    revalidatePath("/reports");
    return {
      ok: true,
      salesPosted,
      expensesPosted,
      grnsPosted,
      customerPaymentsPosted,
      customerDepositsPosted,
      supplierPaymentsPosted,
      salesSkipped,
      expensesSkipped,
      errors: errors.slice(0, 25),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "GL backfill failed",
    };
  }
}
