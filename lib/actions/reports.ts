"use server";

import { getReconciledDatesInRange } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchByInChunks } from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";
import { businessDateFromTimestamptz } from "@/lib/utils/iso-date";

function reportPeriodBounds(fromDate: string, toDate: string) {
  return {
    from: `${fromDate}T00:00:00.000Z`,
    to: `${toDate}T23:59:59.999Z`,
  };
}

async function sumCogsFromSaleIds(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string,
  saleIds: string[],
  outletId?: string | null
): Promise<number> {
  if (saleIds.length === 0) return 0;

  const movements = await fetchByInChunks(saleIds, async (chunk) => {
    let q = supabase
      .from("stock_movements")
      .select("quantity, unit_cost")
      .eq("organization_id", organizationId)
      .eq("movement_type", "sale")
      .eq("reference_type", "sale")
      .in("reference_id", chunk);
    if (outletId) q = q.eq("outlet_id", outletId);
    const { data, error } = await q;
    return { data, error };
  });

  return roundMoney(
    movements.reduce(
      (sum, row) =>
        sum + Math.abs(Number(row.quantity)) * Number(row.unit_cost),
      0
    )
  );
}

export type TrialBalanceRow = {
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance: number;
};

export type ProfitLossRow = {
  code: string;
  name: string;
  account_type: string;
  amount: number;
};

export type BalanceSheetRow = {
  code: string;
  name: string;
  account_type: string;
  balance: number;
  /** Synthetic line (e.g. unclosed net income rolled into equity). */
  isComputed?: boolean;
};

export type FinancialReportSummary = {
  trialBalance: TrialBalanceRow[];
  balanceSheet: {
    assets: BalanceSheetRow[];
    liabilities: BalanceSheetRow[];
    equity: BalanceSheetRow[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    /** Cumulative net income (income − COGS − expenses) included under equity. */
    netIncomeIncluded: number;
    totalLiabilitiesAndEquity: number;
    asOfDate: string;
    isBalanced: boolean;
    balanceVariance: number;
    inventoryReconciliation: {
      glBalance: number;
      stockLedgerAtCost: number;
      variance: number;
    };
  };
  profitAndLoss: {
    income: ProfitLossRow[];
    expenses: ProfitLossRow[];
    cogs: ProfitLossRow[];
    totalIncome: number;
    totalCogs: number;
    totalExpenses: number;
    netIncome: number;
    periodFrom: string | null;
    periodTo: string | null;
  };
};

type CoaRow = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
};

type JournalLineRow = {
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
};

function reportTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function finalizeTrialBalanceRows(
  byCode: Map<string, TrialBalanceRow>
): TrialBalanceRow[] {
  return Array.from(byCode.values())
    .map((a) => {
      const d = roundMoney(a.total_debit);
      const c = roundMoney(a.total_credit);
      const balance =
        a.normal_balance === "debit"
          ? roundMoney(d - c)
          : roundMoney(c - d);
      return { ...a, total_debit: d, total_credit: c, balance };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function accumulateTrialBalance(
  lines: JournalLineRow[],
  entryDateById: Map<string, string>,
  accountMap: Map<string, CoaRow>,
  includeEntry: (entryDate: string) => boolean
): Map<string, TrialBalanceRow> {
  const byCode = new Map<string, TrialBalanceRow>();
  for (const line of lines) {
    const entryDate = entryDateById.get(line.journal_entry_id);
    if (!entryDate || !includeEntry(entryDate)) continue;
    const coa = accountMap.get(line.account_id);
    if (!coa) continue;
    const existing = byCode.get(coa.code) ?? {
      code: coa.code,
      name: coa.name,
      account_type: coa.account_type,
      normal_balance: coa.normal_balance,
      total_debit: 0,
      total_credit: 0,
      balance: 0,
    };
    existing.total_debit += Number(line.debit);
    existing.total_credit += Number(line.credit);
    byCode.set(coa.code, existing);
  }
  return byCode;
}

function profitAndLossFromTrialBalance(trialBalance: TrialBalanceRow[]) {
  const income: ProfitLossRow[] = [];
  const expenses: ProfitLossRow[] = [];
  const cogs: ProfitLossRow[] = [];
  for (const row of trialBalance) {
    if (row.balance === 0) continue;
    const pl: ProfitLossRow = {
      code: row.code,
      name: row.name,
      account_type: row.account_type,
      amount: row.balance,
    };
    if (row.account_type === "income") income.push(pl);
    else if (row.account_type === "expense") expenses.push(pl);
    else if (row.account_type === "cogs") cogs.push(pl);
  }
  const totalIncome = roundMoney(income.reduce((s, r) => s + r.amount, 0));
  const totalCogs = roundMoney(cogs.reduce((s, r) => s + r.amount, 0));
  const totalExpenses = roundMoney(
    expenses.reduce((s, r) => s + r.amount, 0)
  );
  const netIncome = roundMoney(totalIncome - totalCogs - totalExpenses);
  return {
    income,
    expenses,
    cogs,
    totalIncome,
    totalCogs,
    totalExpenses,
    netIncome,
  };
}

function balanceSheetFromTrialBalance(
  trialBalance: TrialBalanceRow[],
  netIncomeIncluded: number
) {
  const assets: BalanceSheetRow[] = [];
  const liabilities: BalanceSheetRow[] = [];
  const equity: BalanceSheetRow[] = [];
  for (const row of trialBalance) {
    if (row.balance === 0) continue;
    const bs: BalanceSheetRow = {
      code: row.code,
      name: row.name,
      account_type: row.account_type,
      balance: row.balance,
    };
    if (row.account_type === "asset") assets.push(bs);
    else if (row.account_type === "liability") liabilities.push(bs);
    else if (row.account_type === "equity") equity.push(bs);
  }
  if (netIncomeIncluded !== 0) {
    equity.push({
      code: "3910",
      name: "Net income (unclosed P&L)",
      account_type: "equity",
      balance: netIncomeIncluded,
      isComputed: true,
    });
  }
  const totalAssets = roundMoney(assets.reduce((s, r) => s + r.balance, 0));
  const totalLiabilities = roundMoney(
    liabilities.reduce((s, r) => s + r.balance, 0)
  );
  const totalEquityAccounts = roundMoney(
    equity.filter((r) => !r.isComputed).reduce((s, r) => s + r.balance, 0)
  );
  const totalEquity = roundMoney(totalEquityAccounts + netIncomeIncluded);
  const totalLiabilitiesAndEquity = roundMoney(
    totalLiabilities + totalEquity
  );
  const balanceVariance = roundMoney(
    totalAssets - totalLiabilitiesAndEquity
  );
  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncomeIncluded,
    totalLiabilitiesAndEquity,
    isBalanced: balanceVariance === 0,
    balanceVariance,
  };
}

async function sumStockInventoryAtCost(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("stock")
    .select("quantity, cost_price")
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
  return roundMoney(
    (data ?? []).reduce(
      (sum, row) => sum + Number(row.quantity) * Number(row.cost_price),
      0
    )
  );
}

export async function getFinancialReports(
  fromDate?: string,
  toDate?: string
): Promise<FinancialReportSummary> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  /** Balance sheet & trial balance: cumulative posted GL through this date. */
  const asOfDate = toDate ?? reportTodayIso();
  const periodFrom = fromDate ?? null;
  const periodTo = toDate ?? asOfDate;

  const [{ data: accounts, error: accErr }, stockLedgerAtCost] =
    await Promise.all([
      supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, normal_balance")
        .eq("organization_id", ctx.organizationId)
        .eq("is_active", true),
      sumStockInventoryAtCost(supabase, ctx.organizationId),
    ]);
  if (accErr) throw new Error(accErr.message);

  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]));

  const { data: entries, error: entErr } = await supabase
    .from("journal_entries")
    .select("id, entry_date")
    .eq("organization_id", ctx.organizationId)
    .eq("is_posted", true)
    .lte("entry_date", asOfDate);
  if (entErr) throw new Error(entErr.message);

  const entryDateById = new Map(
    (entries ?? []).map((e) => [e.id, String(e.entry_date)])
  );
  const entryIds = (entries ?? []).map((e) => e.id);

  const emptyBalanceSheet = {
    assets: [] as BalanceSheetRow[],
    liabilities: [] as BalanceSheetRow[],
    equity: [] as BalanceSheetRow[],
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    netIncomeIncluded: 0,
    totalLiabilitiesAndEquity: 0,
    asOfDate,
    isBalanced: true,
    balanceVariance: 0,
    inventoryReconciliation: {
      glBalance: 0,
      stockLedgerAtCost,
      variance: roundMoney(0 - stockLedgerAtCost),
    },
  };

  if (entryIds.length === 0) {
    return {
      trialBalance: [],
      balanceSheet: emptyBalanceSheet,
      profitAndLoss: {
        income: [],
        expenses: [],
        cogs: [],
        totalIncome: 0,
        totalCogs: 0,
        totalExpenses: 0,
        netIncome: 0,
        periodFrom,
        periodTo,
      },
    };
  }

  const lines = await fetchByInChunks(entryIds, async (chunk) => {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("journal_entry_id, account_id, debit, credit")
      .in("journal_entry_id", chunk);
    return { data, error };
  });

  const cumulativeByCode = accumulateTrialBalance(
    lines as JournalLineRow[],
    entryDateById,
    accountMap,
    () => true
  );
  const periodByCode = accumulateTrialBalance(
    lines as JournalLineRow[],
    entryDateById,
    accountMap,
    (entryDate) => {
      if (periodFrom && entryDate < periodFrom) return false;
      if (entryDate > periodTo) return false;
      return true;
    }
  );

  const trialBalance = finalizeTrialBalanceRows(cumulativeByCode);
  const cumulativePl = profitAndLossFromTrialBalance(trialBalance);
  const periodPl = profitAndLossFromTrialBalance(
    finalizeTrialBalanceRows(periodByCode)
  );

  const bsCore = balanceSheetFromTrialBalance(
    trialBalance,
    cumulativePl.netIncome
  );

  const inventoryGlBalance =
    trialBalance.find((r) => r.code === "1200")?.balance ?? 0;

  return {
    trialBalance,
    balanceSheet: {
      ...bsCore,
      asOfDate,
      inventoryReconciliation: {
        glBalance: inventoryGlBalance,
        stockLedgerAtCost,
        variance: roundMoney(stockLedgerAtCost - inventoryGlBalance),
      },
    },
    profitAndLoss: {
      ...periodPl,
      periodFrom,
      periodTo,
    },
  };
}

export type OperationalReports = {
  period: { from: string; to: string; label: string };
  salesTotal: number;
  salesCount: number;
  expensesTotal: number;
  expensesCount: number;
  netCash: number;
  avgTicket: number;
  creditOutstanding: number;
  lowStockCount: number;
  topProducts: {
    productId: string | null;
    name: string;
    /** Number of sale lines (frequency). */
    lineCount: number;
    /** Sum of sell_qty when recorded, else base quantity. */
    quantity: number;
    unitLabel: string | null;
    revenue: number;
  }[];
  salesByDay: { date: string; total: number; count: number }[];
  paymentMix: { method: string; total: number; count: number }[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Hardware-relevant operational metrics (fast aggregates). */
export async function getOperationalReports(
  days = 7,
  outletId?: string | null
): Promise<OperationalReports> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const from = daysAgoIso(days - 1);
  const to = todayIso();
  const { from: fromBound, to: toBound } = reportPeriodBounds(from, to);

  let salesQuery = supabase
    .from("sales")
    .select("id, total_amount, sale_date, outlet_id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", fromBound)
    .lte("sale_date", toBound);
  if (outletId) salesQuery = salesQuery.eq("outlet_id", outletId);

  let expensesQuery = supabase
    .from("expenses")
    .select("id, amount, expense_date, outlet_id")
    .eq("organization_id", ctx.organizationId)
    .gte("expense_date", from)
    .lte("expense_date", to);
  if (outletId) expensesQuery = expensesQuery.eq("outlet_id", outletId);

  const [salesRes, expensesRes, creditRes, stockRes] = await Promise.all([
    salesQuery,
    expensesQuery,
    supabase
      .from("customers")
      .select("outstanding_balance")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true),
    outletId
      ? supabase
          .from("stock")
          .select("quantity, products!inner(is_active)")
          .eq("outlet_id", outletId)
          .lte("quantity", 5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (creditRes.error) throw new Error(creditRes.error.message);

  const sales = salesRes.data ?? [];
  return buildOperationalResult(
    from,
    to,
    sales,
    expensesRes.data ?? [],
    creditRes.data ?? [],
    stockRes.data,
    sales.map((s) => s.id),
    supabase,
    ctx.organizationId
  );
}

export type ProfitLossStatement = {
  grossSales: number;
  discounts: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
};

/** POS-style P&L from completed sales and recorded expenses in the selected period. */
export async function getProfitLossStatement(
  fromDate: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false
): Promise<ProfitLossStatement> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { from, to } = reportPeriodBounds(fromDate, toDate);

  let salesQuery = supabase
    .from("sales")
    .select("id, subtotal, discount_amount, sale_date")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (outletId) salesQuery = salesQuery.eq("outlet_id", outletId);

  const { data: salesRaw, error: salesErr } = await salesQuery;
  if (salesErr) throw new Error(salesErr.message);

  let sales = salesRaw ?? [];
  if (reconciledDaysOnly) {
    const reconciled = new Set(
      await getReconciledDatesInRange(fromDate, toDate, outletId)
    );
    sales = sales.filter((s) =>
      reconciled.has(businessDateFromTimestamptz(String(s.sale_date)))
    );
  }

  let grossSales = 0;
  let discounts = 0;
  for (const s of sales) {
    const sub = Number(s.subtotal);
    const disc = Number(s.discount_amount);
    grossSales += sub + disc;
    discounts += disc;
  }
  grossSales = roundMoney(grossSales);
  discounts = roundMoney(discounts);
  const netSales = roundMoney(grossSales - discounts);

  let expensesQuery = supabase
    .from("expenses")
    .select("amount, expense_date")
    .eq("organization_id", ctx.organizationId)
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate);
  if (outletId) expensesQuery = expensesQuery.eq("outlet_id", outletId);

  const { data: expensesRaw, error: expErr } = await expensesQuery;
  if (expErr) throw new Error(expErr.message);
  let expenseRows = expensesRaw ?? [];
  if (reconciledDaysOnly) {
    const reconciled = new Set(
      await getReconciledDatesInRange(fromDate, toDate, outletId)
    );
    expenseRows = expenseRows.filter((e) => reconciled.has(e.expense_date));
  }
  const operatingExpenses = roundMoney(
    expenseRows.reduce((s, e) => s + Number(e.amount), 0)
  );

  const saleIds = sales.map((s) => s.id);
  const costOfGoodsSold = await sumCogsFromSaleIds(
    supabase,
    ctx.organizationId,
    saleIds,
    outletId
  );
  const grossProfit = roundMoney(netSales - costOfGoodsSold);
  const netProfit = roundMoney(grossProfit - operatingExpenses);

  return {
    grossSales,
    discounts,
    netSales,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    netProfit,
  };
}

export async function getOperationalReportsByRange(
  fromDate: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false
): Promise<OperationalReports> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { from, to } = reportPeriodBounds(fromDate, toDate);

  let salesQuery = supabase
    .from("sales")
    .select("id, total_amount, sale_date, outlet_id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (outletId) salesQuery = salesQuery.eq("outlet_id", outletId);

  let expensesQuery = supabase
    .from("expenses")
    .select("id, amount, expense_date, outlet_id")
    .eq("organization_id", ctx.organizationId)
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate);
  if (outletId) expensesQuery = expensesQuery.eq("outlet_id", outletId);

  const [salesRes, expensesRes, creditRes, stockRes] = await Promise.all([
    salesQuery,
    expensesQuery,
    supabase
      .from("customers")
      .select("outstanding_balance")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true),
    outletId
      ? supabase
          .from("stock")
          .select("quantity, products!inner(is_active)")
          .eq("outlet_id", outletId)
          .lte("quantity", 5)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (expensesRes.error) throw new Error(expensesRes.error.message);
  if (creditRes.error) throw new Error(creditRes.error.message);

  let sales = salesRes.data ?? [];
  let expenses = expensesRes.data ?? [];
  if (reconciledDaysOnly) {
    const reconciled = new Set(
      await getReconciledDatesInRange(fromDate, toDate, outletId)
    );
    sales = sales.filter((s) =>
      reconciled.has(businessDateFromTimestamptz(String(s.sale_date)))
    );
    expenses = expenses.filter((e) => reconciled.has(e.expense_date));
  }

  return buildOperationalResult(
    fromDate,
    toDate,
    sales,
    expenses,
    creditRes.data ?? [],
    stockRes.data,
    sales.map((s) => s.id),
    supabase,
    ctx.organizationId
  );
}

async function buildOperationalResult(
  from: string,
  to: string,
  sales: { id: string; total_amount: number; sale_date?: string }[],
  expenses: { amount: number }[],
  creditRows: { outstanding_balance: number }[],
  stockData: { quantity: number; products: unknown }[] | null,
  saleIds: string[],
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  organizationId: string
): Promise<OperationalReports> {
  const salesTotal = roundMoney(
    sales.reduce((s, r) => s + Number(r.total_amount), 0)
  );
  const salesCount = sales.length;
  const expensesTotal = roundMoney(
    expenses.reduce((s, r) => s + Number(r.amount), 0)
  );
  const expensesCount = expenses.length;

  const byDay = new Map<string, { total: number; count: number }>();
  for (const s of sales) {
    const d = s.sale_date
      ? businessDateFromTimestamptz(s.sale_date)
      : to;
    const prev = byDay.get(d) ?? { total: 0, count: 0 };
    byDay.set(d, {
      total: prev.total + Number(s.total_amount),
      count: prev.count + 1,
    });
  }
  const salesByDay = Array.from(byDay.entries())
    .map(([date, v]) => ({
      date,
      total: roundMoney(v.total),
      count: v.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let topProducts: OperationalReports["topProducts"] = [];
  let paymentMix: OperationalReports["paymentMix"] = [];

  if (saleIds.length > 0) {
    const { fetchByInChunks } = await import("@/lib/supabase/query-chunks");
    const [saleItems, paymentRows] = await Promise.all([
      fetchByInChunks(saleIds, async (chunk) => {
        const { data, error } = await supabase
          .from("sale_items")
          .select(
            "product_id, product_name, quantity, sell_qty, sell_unit, total_price"
          )
          .in("sale_id", chunk);
        return { data, error };
      }),
      fetchByInChunks(saleIds, async (chunk) => {
        const { data, error } = await supabase
          .from("payments")
          .select("payment_method, amount")
          .eq("organization_id", organizationId)
          .in("sale_id", chunk);
        return { data, error };
      }),
    ]);

    if (saleItems.length > 0) {
      type Agg = {
        productId: string | null;
        name: string;
        lineCount: number;
        quantity: number;
        revenue: number;
        unitCounts: Map<string, number>;
      };
      const prodMap = new Map<string, Agg>();
      for (const row of saleItems) {
        const productId = row.product_id ?? null;
        const key = productId ?? `name:${row.product_name ?? "Unknown"}`;
        const name = row.product_name ?? "Unknown";
        const sellQty =
          row.sell_qty != null ? Number(row.sell_qty) : Number(row.quantity);
        const sellUnit =
          row.sell_unit != null && String(row.sell_unit).trim()
            ? String(row.sell_unit).trim()
            : null;
        const prev = prodMap.get(key) ?? {
          productId,
          name,
          lineCount: 0,
          quantity: 0,
          revenue: 0,
          unitCounts: new Map<string, number>(),
        };
        if (sellUnit) {
          prev.unitCounts.set(
            sellUnit,
            (prev.unitCounts.get(sellUnit) ?? 0) + 1
          );
        }
        prodMap.set(key, {
          ...prev,
          name,
          lineCount: prev.lineCount + 1,
          quantity: roundMoney(prev.quantity + sellQty),
          revenue: roundMoney(prev.revenue + Number(row.total_price)),
        });
      }
      topProducts = Array.from(prodMap.values())
        .map((v) => {
          let unitLabel: string | null = null;
          if (v.unitCounts.size === 1) {
            unitLabel = Array.from(v.unitCounts.keys())[0] ?? null;
          } else if (v.unitCounts.size > 1) {
            unitLabel = Array.from(v.unitCounts.entries()).sort(
              (a, b) => b[1] - a[1]
            )[0]?.[0] ?? null;
          }
          return {
            productId: v.productId,
            name: v.name,
            lineCount: v.lineCount,
            quantity: v.quantity,
            unitLabel,
            revenue: v.revenue,
          };
        })
        .sort(
          (a, b) =>
            b.lineCount - a.lineCount ||
            b.revenue - a.revenue ||
            b.quantity - a.quantity
        )
        .slice(0, 8);
    }

    if (paymentRows.length > 0) {
      const payMap = new Map<string, { total: number; count: number }>();
      for (const p of paymentRows) {
        const m = p.payment_method ?? "other";
        const prev = payMap.get(m) ?? { total: 0, count: 0 };
        payMap.set(m, {
          total: prev.total + Number(p.amount),
          count: prev.count + 1,
        });
      }
      paymentMix = Array.from(payMap.entries())
        .map(([method, v]) => ({
          method,
          total: roundMoney(v.total),
          count: v.count,
        }))
        .sort((a, b) => b.total - a.total);
    }
  }

  const creditOutstanding = roundMoney(
    creditRows.reduce((s, c) => s + Number(c.outstanding_balance), 0)
  );

  let lowStockCount = 0;
  if (stockData) {
    lowStockCount = stockData.filter((row) => {
      const p = row.products as { is_active?: boolean } | null;
      return p?.is_active !== false && Number(row.quantity) <= 5;
    }).length;
  }

  const daySpan = Math.max(
    1,
    Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) / 86400000
    ) + 1
  );

  return buildOperationalPayload(
    from,
    to,
    daySpan,
    salesTotal,
    salesCount,
    expensesTotal,
    expensesCount,
    creditOutstanding,
    lowStockCount,
    topProducts,
    salesByDay,
    paymentMix
  );
}

function buildOperationalPayload(
  from: string,
  to: string,
  daySpan: number,
  salesTotal: number,
  salesCount: number,
  expensesTotal: number,
  expensesCount: number,
  creditOutstanding: number,
  lowStockCount: number,
  topProducts: OperationalReports["topProducts"],
  salesByDay: OperationalReports["salesByDay"],
  paymentMix: OperationalReports["paymentMix"]
): OperationalReports {
  return {
    period: {
      from,
      to,
      label: `${daySpan} day period`,
    },
    salesTotal,
    salesCount,
    expensesTotal,
    expensesCount,
    netCash: roundMoney(salesTotal - expensesTotal),
    avgTicket: salesCount > 0 ? roundMoney(salesTotal / salesCount) : 0,
    creditOutstanding,
    lowStockCount,
    topProducts,
    salesByDay,
    paymentMix,
  };
}

/** Client-side CSV export for operational report period. */
export async function getOperationalExportCsv(
  fromDate: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false
): Promise<string> {
  const data = await getOperationalReportsByRange(
    fromDate,
    toDate,
    outletId,
    reconciledDaysOnly
  );
  const lines = [
    `Period,${data.period.from},${data.period.to}`,
    `Sales total,${data.salesTotal}`,
    `Sales count,${data.salesCount}`,
    `Expenses,${data.expensesTotal}`,
    `Net cash,${data.netCash}`,
    "",
    "Date,Sales,Transactions",
    ...data.salesByDay.map(
      (d) => `${d.date},${d.total},${d.count}`
    ),
    "",
    "Payment method,Total,Count",
    ...data.paymentMix.map(
      (p) => `${p.method},${p.total},${p.count}`
    ),
    "",
    "Product,Lines sold,Qty,Unit,Revenue",
    ...data.topProducts.map(
      (p) =>
        `"${p.name.replace(/"/g, '""')}",${p.lineCount},${p.quantity},${p.unitLabel ?? ""},${p.revenue}`
    ),
  ];
  return lines.join("\n");
}
