"use server";

import { getReconciledDatesInRange } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

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
  };
  profitAndLoss: {
    income: ProfitLossRow[];
    expenses: ProfitLossRow[];
    cogs: ProfitLossRow[];
    totalIncome: number;
    totalCogs: number;
    totalExpenses: number;
    netIncome: number;
  };
};

export async function getFinancialReports(
  fromDate?: string,
  toDate?: string
): Promise<FinancialReportSummary> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  let entriesQuery = supabase
    .from("journal_entries")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("is_posted", true);
  if (fromDate) entriesQuery = entriesQuery.gte("entry_date", fromDate);
  if (toDate) entriesQuery = entriesQuery.lte("entry_date", toDate);
  const { data: entries, error: entErr } = await entriesQuery;
  if (entErr) throw new Error(entErr.message);

  const entryIds = (entries ?? []).map((e) => e.id);
  const empty: FinancialReportSummary = {
    trialBalance: [],
    balanceSheet: {
      assets: [],
      liabilities: [],
      equity: [],
      totalAssets: 0,
      totalLiabilities: 0,
      totalEquity: 0,
    },
    profitAndLoss: {
      income: [],
      expenses: [],
      cogs: [],
      totalIncome: 0,
      totalCogs: 0,
      totalExpenses: 0,
      netIncome: 0,
    },
  };
  if (entryIds.length === 0) return empty;

  const [{ data: lines, error: lineErr }, { data: accounts, error: accErr }] =
    await Promise.all([
      supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit")
        .in("journal_entry_id", entryIds),
      supabase
        .from("chart_of_accounts")
        .select("id, code, name, account_type, normal_balance")
        .eq("organization_id", ctx.organizationId)
        .eq("is_active", true),
    ]);
  if (lineErr) throw new Error(lineErr.message);
  if (accErr) throw new Error(accErr.message);

  const accountMap = new Map(
    (accounts ?? []).map((a) => [a.id, a])
  );

  const byCode = new Map<string, TrialBalanceRow>();

  for (const line of lines ?? []) {
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

  const trialBalance: TrialBalanceRow[] = Array.from(byCode.values())
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
  const totalAssets = roundMoney(assets.reduce((s, r) => s + r.balance, 0));
  const totalLiabilities = roundMoney(
    liabilities.reduce((s, r) => s + r.balance, 0)
  );
  const totalEquity = roundMoney(equity.reduce((s, r) => s + r.balance, 0));

  return {
    trialBalance,
    balanceSheet: {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
    },
    profitAndLoss: {
      income,
      expenses,
      cogs,
      totalIncome,
      totalCogs,
      totalExpenses,
      netIncome,
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
  topProducts: { name: string; quantity: number; revenue: number }[];
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

/** POS-style P&L for the reports screen (sales + GL where posted). */
export async function getProfitLossStatement(
  fromDate: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false
): Promise<ProfitLossStatement> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  let salesQuery = supabase
    .from("sales")
    .select("subtotal, discount_amount, sale_date")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", fromDate)
    .lte("sale_date", `${toDate}T23:59:59.999Z`);
  if (outletId) salesQuery = salesQuery.eq("outlet_id", outletId);

  const { data: salesRaw, error: salesErr } = await salesQuery;
  let sales = salesRaw ?? [];
  if (reconciledDaysOnly) {
    const reconciled = new Set(
      await getReconciledDatesInRange(fromDate, toDate, outletId)
    );
    sales = sales.filter((s) =>
      reconciled.has(String(s.sale_date).slice(0, 10))
    );
  }
  if (salesErr) throw new Error(salesErr.message);

  let grossSales = 0;
  let discounts = 0;
  for (const s of sales ?? []) {
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
  const cashExpensesTotal = roundMoney(
    expenseRows.reduce((s, e) => s + Number(e.amount), 0)
  );

  const financial = await getFinancialReports(fromDate, toDate);
  const hasGl = financial.trialBalance.length > 0;
  const costOfGoodsSold = hasGl
    ? financial.profitAndLoss.totalCogs
    : 0;
  const operatingExpenses = hasGl
    ? financial.profitAndLoss.totalExpenses
    : cashExpensesTotal;
  const grossProfit = roundMoney(netSales - costOfGoodsSold);
  const netProfit = hasGl
    ? financial.profitAndLoss.netIncome
    : roundMoney(grossProfit - operatingExpenses);

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

  let salesQuery = supabase
    .from("sales")
    .select("id, total_amount, sale_date, outlet_id")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", fromDate)
    .lte("sale_date", `${toDate}T23:59:59.999Z`);
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
      reconciled.has(String(s.sale_date).slice(0, 10))
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
    const d = s.sale_date?.slice(0, 10) ?? to;
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
    const [itemsRes, payRes] = await Promise.all([
      supabase
        .from("sale_items")
        .select("product_name, quantity, total_price")
        .in("sale_id", saleIds.slice(0, 500)),
      supabase
        .from("payments")
        .select("payment_method, amount")
        .eq("organization_id", organizationId)
        .in("sale_id", saleIds.slice(0, 500)),
    ]);

    if (!itemsRes.error && itemsRes.data) {
      const prodMap = new Map<string, { quantity: number; revenue: number }>();
      for (const row of itemsRes.data) {
        const name = row.product_name ?? "Unknown";
        const prev = prodMap.get(name) ?? { quantity: 0, revenue: 0 };
        prodMap.set(name, {
          quantity: prev.quantity + Number(row.quantity),
          revenue: prev.revenue + Number(row.total_price),
        });
      }
      topProducts = Array.from(prodMap.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);
    }

    if (!payRes.error && payRes.data) {
      const payMap = new Map<string, { total: number; count: number }>();
      for (const p of payRes.data) {
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
