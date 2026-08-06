"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import {
  buildWhatsAppShareUrl,
  formatClosingReportText,
  type ClosingReportData,
} from "@/lib/utils/closing-report";
import { buildCashVarianceJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { getOrganizationSettings } from "@/lib/actions/settings";
import { fetchAllPaginated, fetchByInChunks } from "@/lib/supabase/query-chunks";
import { businessDayBounds, isoDateToTimestamptz } from "@/lib/utils/iso-date";
import {
  isCustomerArPaymentRef,
  isCustomerDepositRef,
  isLegacyVoidDepositRef,
} from "@/lib/constants/party-payments";

export type DayCashSummary = {
  businessDate: string;
  outletId: string;
  outletName: string;
  openingBalance: number;
  /** Sum of completed sale totals for the business date. */
  totalSales: number;
  salesCount: number;
  /** All expenses on the business date (any payment method). */
  expensesToday: number;
  /** totalSales − expensesToday */
  netToday: number;
  cashSales: number;
  mpesaSales: number;
  cashExpenses: number;
  cashPurchases: number;
  cashSupplierPayments: number;
  cashCustomerPayments: number;
  cashCustomerDeposits: number;
  bankDeposits: number;
  expectedCash: number;
  closingBalance: number | null;
  variance: number | null;
  status: "open" | "reconciled";
  closingId: string | null;
  reconciledAt: string | null;
};

function dayBounds(businessDate: string) {
  return businessDayBounds(businessDate);
}

function saleRevenue(s: {
  total_amount: number;
  amount_paid?: number | null;
  balance_due?: number | null;
}): number {
  const total = Number(s.total_amount);
  if (total > 0) return total;
  return roundMoney(Number(s.amount_paid ?? 0) + Number(s.balance_due ?? 0));
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function apDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}

export async function getPreviousReconciledClosing(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  outletId: string,
  beforeDate: string
): Promise<number> {
  const { data } = await supabase
    .from("daily_closings")
    .select("closing_balance, business_date")
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId)
    .eq("status", "reconciled")
    .lt("business_date", beforeDate)
    .order("business_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.closing_balance != null ? Number(data.closing_balance) : 0;
}

/** Live totals from sales, payments, and expenses for one business date. */
export async function computeDayCashSummary(
  outletId: string,
  businessDate: string
): Promise<DayCashSummary> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { from, to } = dayBounds(businessDate);

  const [{ data: outlet }, { data: existing }] = await Promise.all([
    supabase
      .from("outlets")
      .select("name")
      .eq("id", outletId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle(),
    supabase
      .from("daily_closings")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("business_date", businessDate)
      .maybeSingle(),
  ]);

  if (!outlet) throw new Error("Outlet not found.");

  const openingBalance =
    existing?.opening_balance != null
      ? Number(existing.opening_balance)
      : await getPreviousReconciledClosing(
          supabase,
          ctx.organizationId,
          outletId,
          businessDate
        );

  const sales = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, total_amount, amount_paid, balance_due")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("status", "completed")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  const saleIds = sales.map((s) => s.id);
  const salesCount = sales.length;
  let totalSales = roundMoney(sales.reduce((sum, s) => sum + saleRevenue(s), 0));
  let cashSales = 0;
  let mpesaSales = 0;

  if (saleIds.length > 0) {
    const payments = await fetchByInChunks(saleIds, async (chunk) => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, payment_method, reference_no, customer_id")
        .eq("organization_id", ctx.organizationId)
        .eq("status", "completed")
        .in("sale_id", chunk);
      return { data, error };
    });

    for (const p of payments) {
      // Customer AR collections are counted under cashCustomerPayments.
      if (isCustomerArPaymentRef(p.reference_no) || p.customer_id) continue;
      const amt = Number(p.amount);
      if (p.payment_method === "cash") cashSales += amt;
      else if (p.payment_method === "mpesa") mpesaSales += amt;
    }

    // Fallback when legacy rows have payment amounts but zero total_amount.
    if (totalSales === 0 && (cashSales > 0 || mpesaSales > 0)) {
      totalSales = roundMoney(cashSales + mpesaSales);
    }
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, category, payment_method")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("expense_date", businessDate);

  let cashExpenses = 0;
  let bankDeposits = 0;
  let cashPurchases = 0;
  let expensesToday = 0;
  for (const e of expenses ?? []) {
    const amt = Number(e.amount);
    expensesToday += amt;
    const cat = (e.category ?? "").toLowerCase();
    if (cat === "bank") {
      // Legacy misclassified drawer deposits (pre cash-to-bank fix)
      bankDeposits += amt;
    } else if (
      e.payment_method === "cash" ||
      e.payment_method == null ||
      e.payment_method === ""
    ) {
      cashExpenses += amt;
    }
  }
  expensesToday = roundMoney(expensesToday);

  const { data: drawerDeposits } = await apDb(supabase)
    .from("bank_transactions")
    .select("amount")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("transaction_type", "deposit")
    .eq("transaction_date", businessDate)
    .is("reversed_at", null)
    .ilike("description", "Cash drawer deposit%");
  for (const d of drawerDeposits ?? []) {
    bankDeposits += Number(d.amount);
  }

  const { data: cashGrns } = await supabase
    .from("grns")
    .select("total_amount, payment_method")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("received_date", businessDate)
    .eq("payment_method", "cash");

  for (const g of cashGrns ?? []) {
    cashPurchases += Number(g.total_amount);
  }

  const { data: cashReturns } = await supabase
    .from("supplier_returns")
    .select("total_amount")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("return_date", businessDate)
    .eq("payment_method", "cash");

  for (const r of cashReturns ?? []) {
    cashPurchases -= Number(r.total_amount);
  }

  let cashSupplierPayments = 0;
  const { data: supplierCash } = await apDb(supabase)
    .from("supplier_payments")
    .select("amount")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("payment_method", "cash")
    .eq("payment_date", businessDate);
  for (const p of supplierCash ?? []) {
    cashSupplierPayments += Number(p.amount);
  }

  let cashCustomerPayments = 0;
  let cashCustomerDeposits = 0;
  const customerCash = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("payments")
      .select("amount, reference_no, payment_method, sale_id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("payment_method", "cash")
      .eq("status", "completed")
      .gte("payment_date", from)
      .lte("payment_date", to)
      .not("customer_id", "is", null)
      .order("payment_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  for (const p of customerCash) {
    if (isLegacyVoidDepositRef(p.reference_no)) continue;
    const amt = Number(p.amount);
    if (isCustomerDepositRef(p.reference_no)) {
      // Deposit allocation rows share the parent DEP- reference — skip slices.
      if (p.sale_id != null) continue;
      cashCustomerDeposits += amt;
    } else {
      cashCustomerPayments += amt;
    }
  }

  cashSales = roundMoney(cashSales);
  mpesaSales = roundMoney(mpesaSales);
  cashExpenses = roundMoney(cashExpenses);
  bankDeposits = roundMoney(bankDeposits);
  cashPurchases = roundMoney(Math.max(0, cashPurchases));
  cashSupplierPayments = roundMoney(cashSupplierPayments);
  cashCustomerPayments = roundMoney(cashCustomerPayments);
  cashCustomerDeposits = roundMoney(cashCustomerDeposits);

  const expectedCash = roundMoney(
    openingBalance +
      cashSales +
      cashCustomerPayments +
      cashCustomerDeposits -
      cashExpenses -
      bankDeposits -
      cashPurchases -
      cashSupplierPayments
  );

  const closingBalance =
    existing?.closing_balance != null ? Number(existing.closing_balance) : null;
  const variance =
    existing?.variance != null
      ? Number(existing.variance)
      : closingBalance != null
        ? roundMoney(closingBalance - expectedCash)
        : null;

  return {
    businessDate,
    outletId,
    outletName: outlet.name,
    openingBalance: roundMoney(openingBalance),
    totalSales,
    salesCount,
    expensesToday,
    netToday: roundMoney(totalSales - expensesToday),
    cashSales,
    mpesaSales,
    cashExpenses,
    cashPurchases,
    cashSupplierPayments,
    cashCustomerPayments,
    cashCustomerDeposits,
    bankDeposits,
    expectedCash,
    closingBalance,
    variance,
    status: (existing?.status as "open" | "reconciled") ?? "open",
    closingId: existing?.id ?? null,
    reconciledAt: existing?.reconciled_at ?? null,
  };
}

const reconcileInput = z.object({
  outletId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedClosing: z.coerce.number().nonnegative(),
  openingBalance: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

export async function reconcileDailyClosing(
  raw: z.infer<typeof reconcileInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = reconcileInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const summary = await computeDayCashSummary(
      input.outletId,
      input.businessDate
    );

    const opening =
      input.openingBalance ?? summary.openingBalance;
    const expected = roundMoney(
      opening +
        summary.cashSales +
        summary.cashCustomerPayments +
        summary.cashCustomerDeposits -
        summary.cashExpenses -
        summary.bankDeposits -
        summary.cashPurchases -
        summary.cashSupplierPayments
    );
    const variance = roundMoney(input.countedClosing - expected);

    const row = {
      organization_id: ctx.organizationId,
      outlet_id: input.outletId,
      business_date: input.businessDate,
      opening_balance: opening,
      closing_balance: input.countedClosing,
      expected_cash: expected,
      cash_sales: summary.cashSales,
      cash_expenses: summary.cashExpenses,
      mpesa_sales: summary.mpesaSales,
      bank_deposits: summary.bankDeposits,
      variance,
      status: "reconciled" as const,
      reconciled_at: new Date().toISOString(),
      reconciled_by: ctx.userId,
      notes: input.notes?.trim() || null,
    };

    const { error } = await supabase.from("daily_closings").upsert(row, {
      onConflict: "organization_id,outlet_id,business_date",
    });
    if (error) return { ok: false, message: error.message };

    const { data: openSession } = await supabase
      .from("cash_sessions")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", input.outletId)
      .eq("business_date", input.businessDate)
      .eq("status", "open")
      .maybeSingle();
    if (openSession) {
      await supabase
        .from("cash_sessions")
        .update({
          closing_balance: input.countedClosing,
          expected_balance: expected,
          variance,
          status: "closed",
          closed_at: isoDateToTimestamptz(input.businessDate),
        })
        .eq("id", openSession.id);
    }

    if (variance !== 0) {
      const varianceLines = buildCashVarianceJournalLines(variance);
      const journal = await postJournalEntry({
        description: `Cash count variance ${input.businessDate} (${variance > 0 ? "over" : "short"})`,
        sourceType: "manual",
        sourceId: undefined,
        outletId: input.outletId,
        entryDate: input.businessDate,
        lines: varianceLines,
      });
      if (!journal.ok) {
        return {
          ok: false,
          message: `Reconciled but GL variance failed: ${journal.message}`,
        };
      }
    }

    revalidatePath("/daily-closing");
    revalidatePath("/reports");
    revalidatePath("/pos");
    revalidatePath("/finance/cash-sessions");
    revalidatePath("/inventory/catch-up");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Reconcile failed",
    };
  }
}

export type UnreconciledDayRow = {
  businessDate: string;
  outletId: string;
  outletName: string;
  expectedCash: number;
  hasActivity: boolean;
};

/** Days with sales/expenses but not reconciled (or no closing row). */
export async function listUnreconciledDays(
  outletId?: string | null,
  limit = 60
): Promise<UnreconciledDayRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  let outletsQuery = supabase
    .from("outlets")
    .select("id, name")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true);
  if (outletId) outletsQuery = outletsQuery.eq("id", outletId);
  const { data: outlets } = await outletsQuery;
  if (!outlets?.length) return [];

  const results: UnreconciledDayRow[] = [];

  for (const o of outlets) {
    const { data: sales } = await supabase
      .from("sales")
      .select("sale_date")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", o.id)
      .eq("status", "completed")
      .order("sale_date", { ascending: false })
      .limit(2000);

    const { data: expenses } = await supabase
      .from("expenses")
      .select("expense_date")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", o.id)
      .order("expense_date", { ascending: false })
      .limit(2000);

    const dates = new Set<string>();
    for (const s of sales ?? []) {
      dates.add(String(s.sale_date).slice(0, 10));
    }
    for (const e of expenses ?? []) {
      dates.add(e.expense_date);
    }

    const { data: reconciled } = await supabase
      .from("daily_closings")
      .select("business_date")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", o.id)
      .eq("status", "reconciled");

    const reconciledSet = new Set(
      (reconciled ?? []).map((r) => r.business_date)
    );

    for (const d of Array.from(dates)) {
      if (reconciledSet.has(d)) continue;
      const summary = await computeDayCashSummary(o.id, d);
      results.push({
        businessDate: d,
        outletId: o.id,
        outletName: o.name,
        expectedCash: summary.expectedCash,
        hasActivity: true,
      });
    }
  }

  return results
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
    .slice(0, limit);
}

export async function getReconciledDatesInRange(
  fromDate: string,
  toDate: string,
  outletId?: string | null
): Promise<string[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("daily_closings")
    .select("business_date")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "reconciled")
    .gte("business_date", fromDate)
    .lte("business_date", toDate);
  if (outletId) q = q.eq("outlet_id", outletId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.business_date as string);
}

export async function buildClosingReportForWhatsApp(
  outletId: string,
  businessDate: string
): Promise<
  | { ok: true; message: string; whatsappUrl: string | null }
  | { ok: false; message: string }
> {
  try {
    const summary = await computeDayCashSummary(outletId, businessDate);
    const report: ClosingReportData = {
      outletName: summary.outletName,
      businessDate: summary.businessDate,
      openingBalance: summary.openingBalance,
      cashSales: summary.cashSales,
      mpesaSales: summary.mpesaSales,
      cashExpenses: summary.cashExpenses,
      cashPurchases: summary.cashPurchases,
      cashSupplierPayments: summary.cashSupplierPayments,
      cashCustomerPayments: summary.cashCustomerPayments,
      cashCustomerDeposits: summary.cashCustomerDeposits,
      bankDeposits: summary.bankDeposits,
      expectedCash: summary.expectedCash,
      closingBalance: summary.closingBalance,
      variance: summary.variance,
      status: summary.status,
      reconciledAt: summary.reconciledAt,
    };
    const message = formatClosingReportText(report);
    const settings = await getOrganizationSettings();
    const phone =
      settings?.phone?.trim() ||
      (await getDirectorWhatsAppFromSettings()) ||
      null;
    const whatsappUrl = phone ? buildWhatsAppShareUrl(phone, message) : null;
    return { ok: true, message, whatsappUrl };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Report failed",
    };
  }
}

async function getDirectorWhatsAppFromSettings(): Promise<string | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", "director_whatsapp")
    .maybeSingle();
  const v = data?.value;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (v && typeof v === "object" && "phone" in v) {
    const p = (v as { phone?: string }).phone;
    if (p?.trim()) return p.trim();
  }
  return null;
}

export async function markClosingReportSent(
  outletId: string,
  businessDate: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: row, error: findErr } = await supabase
      .from("daily_closings")
      .select("id, status")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("business_date", businessDate)
      .maybeSingle();
    if (findErr) return { ok: false, message: findErr.message };
    if (!row) {
      return {
        ok: false,
        message: "Reconcile this day before sending the director report.",
      };
    }
    if (row.status !== "reconciled") {
      return {
        ok: false,
        message: "Day must be reconciled before marking the report as sent.",
      };
    }
    const { error } = await supabase
      .from("daily_closings")
      .update({ report_sent_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/inventory/catch-up");
    revalidatePath("/daily-closing");
    revalidatePath("/pos");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not mark report sent",
    };
  }
}
