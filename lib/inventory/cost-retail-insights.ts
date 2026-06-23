import type { StockMovementRow } from "@/lib/inventory/stock-value-series";
import { roundMoney } from "@/lib/utils/calculations";

export type CostRetailInsight = {
  id: string;
  title: string;
  body: string;
  action: string;
  severity: "positive" | "warning" | "info";
};

export type CostRetailMarginAnalysis = {
  openingMarginPct: number;
  closingMarginPct: number;
  marginPctChange: number;
  costValueChangePct: number;
  retailValueChangePct: number;
  costOutpacingRetail: boolean;
  skusCostRaisedWithoutRetail: number;
  insights: CostRetailInsight[];
};

function marginPct(costValue: number, retailValue: number): number {
  if (retailValue <= 0) return 0;
  return roundMoney(((retailValue - costValue) / retailValue) * 100);
}

function isRetailPriceMovement(note: string | null): boolean {
  return (note ?? "").toLowerCase().includes("retail");
}

function isCostPriceMovement(note: string | null): boolean {
  const n = (note ?? "").toLowerCase();
  return n.includes("buying") || n.includes("cost ");
}

export function buildCostRetailMarginAnalysis(input: {
  openingCostValue: number;
  closingCostValue: number;
  openingRetailValue: number;
  closingRetailValue: number;
  costValueChangePct: number;
  retailValueChangePct: number;
  movements: StockMovementRow[];
  fromMs: number;
  toMs: number;
  productNames: Map<string, string>;
}): CostRetailMarginAnalysis {
  const {
    openingCostValue,
    closingCostValue,
    openingRetailValue,
    closingRetailValue,
    costValueChangePct,
    retailValueChangePct,
    movements,
    fromMs,
    toMs,
    productNames,
  } = input;

  const openingMarginPct = marginPct(openingCostValue, openingRetailValue);
  const closingMarginPct = marginPct(closingCostValue, closingRetailValue);
  const marginPctChange = roundMoney(closingMarginPct - openingMarginPct);
  const costOutpacingRetail =
    costValueChangePct > retailValueChangePct + 1 && openingCostValue > 0;

  const costAdjustedInPeriod = new Set<string>();
  const retailAdjustedInPeriod = new Set<string>();

  for (const m of movements) {
    if (!m.product_id || m.reference_type !== "price_adjustment") continue;
    const at = new Date(m.created_at).getTime();
    if (at < fromMs || at > toMs) continue;
    if (isRetailPriceMovement(m.notes)) {
      retailAdjustedInPeriod.add(m.product_id);
    } else if (isCostPriceMovement(m.notes)) {
      costAdjustedInPeriod.add(m.product_id);
    }
  }

  const skusCostRaisedWithoutRetail = Array.from(costAdjustedInPeriod).filter(
    (id) => !retailAdjustedInPeriod.has(id)
  ).length;

  const insights: CostRetailInsight[] = [];

  if (openingRetailValue > 0 && closingRetailValue > 0) {
    insights.push({
      id: "margin-snapshot",
      title: `Gross margin on stock: ${closingMarginPct}%`,
      body: `At period start margin was ${openingMarginPct}% on inventory at retail (${marginPctChange >= 0 ? "+" : ""}${marginPctChange} pts). Orange line = cost value; blue = retail value on the chart.`,
      action:
        marginPctChange < 0
          ? "Review buying prices vs selling prices on Stock & prices — raise retail where costs climbed."
          : "Maintain retail updates whenever supplier costs change.",
      severity: marginPctChange < -2 ? "warning" : marginPctChange > 1 ? "positive" : "info",
    });
  }

  if (costOutpacingRetail) {
    insights.push({
      id: "cost-faster-than-retail",
      title: "Cost value rising faster than retail value",
      body: `Stock at cost moved ${costValueChangePct >= 0 ? "+" : ""}${costValueChangePct}% this period while retail stock value moved ${retailValueChangePct >= 0 ? "+" : ""}${retailValueChangePct}%. Buying prices or cheaper stock mix may be outpacing your selling price updates.`,
      action:
        "Use Stock & prices to align retail with new costs — check items with the (i) price insight icon.",
      severity: "warning",
    });
  } else if (
    retailValueChangePct > costValueChangePct + 1 &&
    openingCostValue > 0
  ) {
    insights.push({
      id: "retail-ahead",
      title: "Retail value keeping ahead of cost",
      body: `Retail stock value grew ${retailValueChangePct >= 0 ? "+" : ""}${retailValueChangePct}% vs ${costValueChangePct >= 0 ? "+" : ""}${costValueChangePct}% at cost — your price list is keeping pace with inventory cost.`,
      action: "Monitor fast movers so margin does not erode on high-volume SKUs.",
      severity: "positive",
    });
  }

  if (skusCostRaisedWithoutRetail > 0) {
    const sample = Array.from(costAdjustedInPeriod)
      .filter((id) => !retailAdjustedInPeriod.has(id))
      .slice(0, 3)
      .map((id) => productNames.get(id) ?? "SKU")
      .join(", ");
    insights.push({
      id: "cost-no-retail",
      title: `${skusCostRaisedWithoutRetail} SKU(s) had buying price raised without retail update`,
      body: `In this period, buying prices were changed but retail was not updated on the same items${sample ? ` (e.g. ${sample})` : ""}. Margin on those lines will shrink until retail is adjusted.`,
      action: "Open Stock & prices, filter low margin, and update selling prices.",
      severity: "warning",
    });
  }

  if (marginPctChange <= -3) {
    insights.push({
      id: "margin-compression",
      title: "Margin on inventory compressed",
      body: `Potential margin on hand fell ${Math.abs(marginPctChange)} percentage points (${openingMarginPct}% → ${closingMarginPct}%). This usually means costs rose or retail was discounted without matching cost relief.`,
      action: "Prioritise retail price reviews on categories with recent GRNs or cost edits.",
      severity: "warning",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "stable",
      title: "Cost and retail values are stable",
      body: "No significant divergence between cost and retail stock value in this period. Keep recording price changes on Stock & prices when suppliers adjust invoices.",
      action: "Compare orange (cost) and blue (retail) lines on the chart when receiving new stock.",
      severity: "info",
    });
  }

  return {
    openingMarginPct,
    closingMarginPct,
    marginPctChange,
    costValueChangePct,
    retailValueChangePct,
    costOutpacingRetail,
    skusCostRaisedWithoutRetail,
    insights: insights.slice(0, 5),
  };
}
