const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const orgId = "429918af-f289-4789-841a-1bddf220db95";
const outDir = "C:/Users/HP/Desktop/FREMBO FINANCIALS/exports";
const from = "2026-05-11";
const to = "2026-06-18";

async function main() {
  const [salesRes, expensesRes, stockRes, customersRes, suppliersRes, bankingRes] =
    await Promise.all([
      sb
        .from("sales")
        .select("id,total_amount,subtotal,discount_amount,sale_date,status")
        .eq("organization_id", orgId)
        .eq("status", "completed")
        .gte("sale_date", `${from}T00:00:00`)
        .lte("sale_date", `${to}T23:59:59`),
      sb
        .from("expenses")
        .select("amount,expense_date,category,description,payment_method")
        .eq("organization_id", orgId)
        .gte("expense_date", from)
        .lte("expense_date", to),
      sb
        .from("stock")
        .select("quantity,cost_price,retail_price,products(name,sku)")
        .eq("organization_id", orgId),
      sb
        .from("customers")
        .select("name,outstanding_balance")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .gt("outstanding_balance", 0),
      sb
        .from("suppliers")
        .select("name,outstanding_balance")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .gt("outstanding_balance", 0),
      sb
        .from("bank_accounts")
        .select("name,account_type,current_balance")
        .eq("organization_id", orgId),
    ]);

  const sales = salesRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const stock = stockRes.data ?? [];

  const saleIds = sales.map((s) => s.id);
  let cogs = 0;
  for (let i = 0; i < saleIds.length; i += 100) {
    const chunk = saleIds.slice(i, i + 100);
    const mv = await sb
      .from("stock_movements")
      .select("quantity,unit_cost")
      .eq("organization_id", orgId)
      .eq("movement_type", "sale")
      .in("reference_id", chunk);
    for (const r of mv.data ?? []) {
      cogs += Math.abs(Number(r.quantity)) * Number(r.unit_cost);
    }
  }

  const daily = {};
  for (const s of sales) {
    const d = s.sale_date.slice(0, 10);
    daily[d] = (daily[d] ?? 0) + Number(s.total_amount);
  }

  const netSales = sales.reduce((s, r) => s + Number(r.total_amount), 0);
  const grossSales = sales.reduce(
    (s, r) => s + Number(r.subtotal) + Number(r.discount_amount),
    0
  );
  const discounts = sales.reduce((s, r) => s + Number(r.discount_amount), 0);
  const expensesTotal = expenses.reduce((s, r) => s + Number(r.amount), 0);

  const summary = {
    business: "SUPAFUNDI (Hardware Store)",
    entity: "FREMBO ENTERPRISES CO. LTD",
    posGoLive: "2026-05-11",
    reportGenerated: new Date().toISOString(),
    period: { from, to, tradingDays: Object.keys(daily).length },
    sales: {
      count: sales.length,
      grossSales: Math.round(grossSales),
      discounts: Math.round(discounts),
      netSales: Math.round(netSales),
      cogs: Math.round(cogs),
      grossProfit: Math.round(netSales - cogs),
      grossMarginPct: netSales
        ? Math.round(((netSales - cogs) / netSales) * 1000) / 10
        : 0,
    },
    expenses: {
      total: Math.round(expensesTotal),
      byCategory: Object.entries(
        expenses.reduce((m, e) => {
          m[e.category] = (m[e.category] ?? 0) + Number(e.amount);
          return m;
        }, {})
      )
        .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
        .sort((a, b) => b.amount - a.amount),
    },
    balanceSheetItems: {
      inventoryAtCost: Math.round(
        stock.reduce((s, r) => s + Number(r.quantity) * Number(r.cost_price), 0)
      ),
      inventoryAtRetail: Math.round(
        stock.reduce(
          (s, r) => s + Number(r.quantity) * Number(r.retail_price ?? 0),
          0
        )
      ),
      tradeDebtors: Math.round(
        (customersRes.data ?? []).reduce(
          (s, r) => s + Number(r.outstanding_balance),
          0
        )
      ),
      tradeCreditors: Math.round(
        (suppliersRes.data ?? []).reduce(
          (s, r) => s + Number(r.outstanding_balance),
          0
        )
      ),
      cashAndBank: (bankingRes.data ?? []).map((b) => ({
        name: b.name,
        type: b.account_type,
        balance: Number(b.current_balance),
      })),
    },
    netProfit: Math.round(netSales - cogs - expensesTotal),
    dailySales: Object.entries(daily)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: Math.round(total) })),
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "supafundi-pos-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  fs.writeFileSync(
    path.join(outDir, "supafundi-daily-sales.csv"),
    ["date,sales_tzs", ...summary.dailySales.map((d) => `${d.date},${d.total}`)].join("\n")
  );

  fs.writeFileSync(
    path.join(outDir, "supafundi-expenses.csv"),
    [
      "date,category,amount,description,payment_method",
      ...expenses.map(
        (e) =>
          `${e.expense_date},${e.category},${e.amount},"${(e.description ?? "").replace(/"/g, '""')}",${e.payment_method ?? ""}`
      ),
    ].join("\n")
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
