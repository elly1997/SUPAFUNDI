import type { CostRetailMarginAnalysis } from "@/lib/inventory/cost-retail-insights";
import type { CategoryMetricRow } from "@/lib/inventory/category-metrics";
import { formatTzs } from "@/lib/utils/currency";
import { roundMoney } from "@/lib/utils/calculations";

export type InventoryDecisionInsight = {
  id: string;
  title: string;
  body: string;
  action: string;
  severity: "positive" | "warning" | "info";
  priority: number;
};

type FastMovingRow = {
  productName: string;
  quantitySold: number;
  revenue: number;
  daysOnShelf: number | null;
};

type PurchaseHint = {
  categoryName: string;
  priority: "high" | "medium" | "low";
  message: string;
};

type BuildInsightsInput = {
  categories: CategoryMetricRow[];
  fastMoving: FastMovingRow[];
  purchaseHints: PurchaseHint[];
  costRetailMargin: CostRetailMarginAnalysis;
  stockBuildUpCost: number;
  stockValueChangePct: number;
  closingStockValue: number;
  potentialMargin: number;
  lowStockCount: number;
  periodLabel: string;
};

function pctOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return roundMoney((part / whole) * 100);
}

export function buildInventoryDecisionInsights(
  input: BuildInsightsInput
): InventoryDecisionInsight[] {
  const {
    categories,
    fastMoving,
    purchaseHints,
    costRetailMargin,
    stockBuildUpCost,
    stockValueChangePct,
    closingStockValue,
    potentialMargin,
    lowStockCount,
    periodLabel,
  } = input;

  const insights: InventoryDecisionInsight[] = [];
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
  const withSales = categories.filter((c) => c.revenue > 0);
  const bySales = [...withSales].sort((a, b) => b.revenue - a.revenue);
  const byMargin = [...withSales]
    .filter((c) => c.revenue >= Math.max(100_000, totalRevenue * 0.02))
    .sort((a, b) => b.margin - a.margin);
  const negativeMargin = withSales.filter((c) => c.margin < 0 && c.revenue >= 50_000);
  const slowHighStock = withSales.filter(
    (c) =>
      c.avgDaysOnShelf != null &&
      c.avgDaysOnShelf >= 90 &&
      c.stockCostValue >= closingStockValue * 0.08
  );
  const fastLowCover = withSales.filter(
    (c) =>
      c.avgDaysOnShelf != null &&
      c.avgDaysOnShelf <= 21 &&
      c.revenue >= totalRevenue * 0.05
  );
  const stockHeavyNoSales = categories.filter(
    (c) => c.revenue === 0 && c.stockCostValue >= 500_000
  );

  if (bySales[0] && totalRevenue > 0) {
    const top = bySales[0];
    const share = pctOf(top.revenue, totalRevenue);
    insights.push({
      id: "sales-concentration",
      title: `${top.categoryName} drives ${share}% of period sales`,
      body: `${formatTzs(top.revenue)} sold in ${periodLabel}. Stock on hand at cost: ${formatTzs(top.stockCostValue)}${top.avgDaysOnShelf != null ? ` · ~${top.avgDaysOnShelf} days cover at current pace` : ""}.`,
      action:
        top.avgDaysOnShelf != null && top.avgDaysOnShelf < 21
          ? "Prioritise replenishment POs for this category before month-end."
          : "Keep 3–4 weeks cover; review fast SKUs weekly on Stock & prices.",
      severity: top.avgDaysOnShelf != null && top.avgDaysOnShelf < 14 ? "warning" : "info",
      priority: 90,
    });
  }

  if (byMargin[0] && byMargin[0].margin > 0) {
    const m = byMargin[0];
    insights.push({
      id: "margin-leader",
      title: `Best profit contributor: ${m.categoryName}`,
      body: `${formatTzs(m.margin)} gross margin (${m.marginPct}% on ${formatTzs(m.revenue)} sales). Protect availability — margin leaders fund slower lines.`,
      action: "Avoid deep discounts here; ensure buying costs are updated on GRN.",
      severity: "positive",
      priority: 70,
    });
  }

  if (negativeMargin.length > 0) {
    const names = negativeMargin
      .slice(0, 3)
      .map((c) => `${c.categoryName} (${formatTzs(c.margin)})`)
      .join("; ");
    insights.push({
      id: "negative-margin",
      title: `${negativeMargin.length} categor${negativeMargin.length === 1 ? "y" : "ies"} sold below cost`,
      body: `${names}. Usually wholesale pricing, stale costs on GRN, or retail not raised after supplier increases.`,
      action:
        "Open Stock & prices — align retail to buying cost on these lines; check POS wholesale toggle.",
      severity: "warning",
      priority: 95,
    });
  }

  if (fastLowCover.length > 0) {
    const names = fastLowCover
      .map((c) => `${c.categoryName} (~${c.avgDaysOnShelf}d)`)
      .join(", ");
    insights.push({
      id: "low-cover-fast",
      title: "Fast categories running thin on shelf",
      body: `${names} — sales velocity will exhaust current stock within ~3 weeks at this outlet.`,
      action: "Raise reorder points or place POs now; check Receive goods for incoming stock.",
      severity: "warning",
      priority: 88,
    });
  }

  if (slowHighStock.length > 0) {
    const s = slowHighStock[0]!;
    insights.push({
      id: "slow-capital",
      title: `${s.categoryName} ties up capital (${formatTzs(s.stockCostValue)} at cost)`,
      body: `~${s.avgDaysOnShelf} days of cover — stock is moving slowly while ${formatTzs(s.stockCostValue)} sits on shelf.`,
      action: "Reduce next PO quantities; consider promotions or transfer to a busier outlet.",
      severity: "warning",
      priority: 75,
    });
  }

  if (stockHeavyNoSales.length > 0) {
    const s = stockHeavyNoSales[0]!;
    insights.push({
      id: "dead-stock",
      title: `${s.categoryName} has stock but no POS sales this period`,
      body: `${formatTzs(s.stockCostValue)} at cost on hand with zero recorded sales in ${periodLabel}.`,
      action: "Verify shelf placement and pricing; consider bundling or marking down slow SKUs.",
      severity: "warning",
      priority: 72,
    });
  }

  if (stockBuildUpCost > 0 && stockValueChangePct > 15) {
    insights.push({
      id: "stock-buildup",
      title: `Inventory capital up ${formatTzs(stockBuildUpCost)} (${stockValueChangePct}%)`,
      body: `Closing stock at cost is ${formatTzs(closingStockValue)}. Potential margin on hand: ${formatTzs(potentialMargin)}.`,
      action:
        fastLowCover.length > 0
          ? "Build-up matches fast sellers — OK if funded by sales. Otherwise pause bulk buys."
          : "Match purchases to sales velocity — avoid over-ordering slow categories.",
      severity: stockValueChangePct > 30 ? "warning" : "info",
      priority: 60,
    });
  } else if (stockBuildUpCost < 0) {
    insights.push({
      id: "stock-drawdown",
      title: `Stock draw-down of ${formatTzs(Math.abs(stockBuildUpCost))}`,
      body: `Inventory at cost fell ${Math.abs(stockValueChangePct)}% this period — sales outpaced replenishment or transfers out.`,
      action: "Review low-stock alerts and fast movers; schedule GRNs before stock-outs.",
      severity: "info",
      priority: 65,
    });
  }

  if (lowStockCount > 0) {
    insights.push({
      id: "low-stock",
      title: `${lowStockCount} SKU(s) at or below reorder`,
      body: "These items may stock out before the next delivery if not replenished.",
      action: "Open Stock & prices → filter low stock → create purchase orders.",
      severity: "warning",
      priority: 85,
    });
  }

  if (costRetailMargin.costOutpacingRetail) {
    insights.push({
      id: "cost-retail-gap",
      title: "Buying prices rising faster than retail list",
      body: `Cost stock value moved ${costRetailMargin.costValueChangePct >= 0 ? "+" : ""}${costRetailMargin.costValueChangePct}% vs retail ${costRetailMargin.retailValueChangePct >= 0 ? "+" : ""}${costRetailMargin.retailValueChangePct}%. Margin on hand: ${costRetailMargin.closingMarginPct}%.`,
      action: costRetailMargin.insights[0]?.action ?? "Update retail on Stock & prices after each GRN.",
      severity: "warning",
      priority: 80,
    });
  }

  if (fastMoving[0]) {
    const f = fastMoving[0];
    insights.push({
      id: "top-sku",
      title: `Fastest SKU: ${f.productName}`,
      body: `${f.quantitySold} units · ${formatTzs(f.revenue)} in ${periodLabel}${f.daysOnShelf != null ? ` · ~${f.daysOnShelf} days on shelf` : ""}.`,
      action: "Set reorder point to cover at least 2 weeks of this velocity.",
      severity: "info",
      priority: 55,
    });
  }

  for (const hint of purchaseHints.slice(0, 2)) {
    insights.push({
      id: `hint-${hint.categoryName}-${hint.priority}`,
      title: hint.categoryName === "All" ? "Replenishment priority" : hint.categoryName,
      body: hint.message,
      action: "See purchase allocation hints below for category-level PO guidance.",
      severity: hint.priority === "high" ? "warning" : "info",
      priority: hint.priority === "high" ? 50 : 40,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "building-data",
      title: "Building your inventory picture",
      body: "Complete POS sales and receive goods with costs to unlock category insights and purchase guidance.",
      action: "Sell on POS and record GRNs — refresh this report after a few days of trading.",
      severity: "info",
      priority: 10,
    });
  }

  return insights
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);
}
