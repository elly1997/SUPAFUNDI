import { roundMoney, retailPriceFromCost } from "@/lib/utils/calculations";

export type PriceRecommendationReason =
  | "below_cost"
  | "thin_margin"
  | "cost_increased"
  | "cost_decreased"
  | "volume_premium"
  | "seasonal_peak"
  | "missing_retail"
  | "aligned";

export type PriceRecommendationSeverity = "critical" | "warning" | "info" | "none";

export type PriceRecommendation = {
  productId: string;
  productName?: string;
  currentRetail: number | null;
  currentCost: number;
  recommendedRetail: number;
  currentMarginPct: number | null;
  recommendedMarginPct: number;
  avgSellPrice: number | null;
  quantitySold90d: number;
  costChangePct: number | null;
  seasonalLiftPct: number | null;
  reasons: PriceRecommendationReason[];
  severity: PriceRecommendationSeverity;
  summary: string;
  action: string;
};

export type ProductBundleSuggestion = {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  coPurchaseCount: number;
  lift: number;
  combinedRetail: number;
  combinedCost: number;
  suggestedBundlePrice: number;
  bundleMarginPct: number;
  message: string;
};

export function marginPctOnCost(cost: number, retail: number): number {
  if (cost <= 0) return retail > 0 ? 100 : 0;
  return roundMoney(((retail - cost) / cost) * 100);
}

function severityFromReasons(
  reasons: PriceRecommendationReason[]
): PriceRecommendationSeverity {
  if (reasons.includes("below_cost")) return "critical";
  if (reasons.includes("thin_margin") || reasons.includes("cost_increased"))
    return "warning";
  if (
    reasons.includes("cost_decreased") ||
    reasons.includes("volume_premium") ||
    reasons.includes("seasonal_peak") ||
    reasons.includes("missing_retail")
  )
    return "info";
  return "none";
}

function buildSummary(
  reasons: PriceRecommendationReason[],
  currentRetail: number | null,
  recommendedRetail: number,
  costChangePct: number | null
): string {
  if (reasons.includes("below_cost"))
    return "Selling below buying price — update immediately.";
  if (reasons.includes("missing_retail"))
    return "No selling price set — recommended from cost and sales data.";
  if (reasons.includes("thin_margin"))
    return "Margin is below target for this cost.";
  if (reasons.includes("cost_increased"))
    return `Buying cost rose${costChangePct != null ? ` ${costChangePct}%` : ""} — raise selling price to protect margin.`;
  if (reasons.includes("volume_premium"))
    return "Customers pay above list price on average — room to raise.";
  if (reasons.includes("seasonal_peak"))
    return "Category in seasonal peak — slight premium supported.";
  if (reasons.includes("cost_decreased"))
    return "Cost fell — hold price for margin or nudge down for volume.";
  if (currentRetail != null && Math.abs(currentRetail - recommendedRetail) < 50)
    return "Price aligned with cost and sales.";
  return "Suggested selling price from cost trend and demand.";
}

function buildAction(reasons: PriceRecommendationReason[]): string {
  if (reasons.includes("below_cost"))
    return "Apply suggested price before next sale.";
  if (reasons.includes("cost_increased") || reasons.includes("thin_margin"))
    return "Update price list or accept on receive.";
  if (reasons.includes("volume_premium") || reasons.includes("seasonal_peak"))
    return "Consider the suggested price before peak demand.";
  if (reasons.includes("cost_decreased"))
    return "Keep margin at new cost or match market if competitors dropped.";
  if (reasons.includes("missing_retail"))
    return "Set retail on price list or when receiving stock.";
  return "Review when cost or seasonality changes.";
}

/** Recommend retail from cost, sales velocity, cost trend, and seasonality. */
export function computePriceRecommendation(input: {
  productId: string;
  cost: number;
  currentRetail: number | null;
  targetMarginPct: number;
  minMarginPct?: number;
  avgSellPrice: number | null;
  quantitySold90d: number;
  costChangePct: number | null;
  /** e.g. 1.05 = category in peak month (+5% premium cap). */
  seasonalMultiplier?: number;
}): PriceRecommendation {
  const {
    productId,
    cost,
    currentRetail,
    targetMarginPct,
    minMarginPct = 15,
    avgSellPrice,
    quantitySold90d,
    costChangePct,
    seasonalMultiplier = 1,
  } = input;

  const reasons: PriceRecommendationReason[] = [];
  const currentMarginPct =
    currentRetail != null && cost > 0
      ? marginPctOnCost(cost, currentRetail)
      : null;

  if (cost <= 0) {
    return {
      productId,
      currentRetail,
      currentCost: cost,
      recommendedRetail: currentRetail ?? 0,
      currentMarginPct,
      recommendedMarginPct: 0,
      avgSellPrice,
      quantitySold90d,
      costChangePct,
      seasonalLiftPct: null,
      reasons: ["aligned"],
      severity: "none",
      summary: "Set buying cost first.",
      action: "Enter unit cost on receive or stock.",
    };
  }

  if (currentRetail == null) reasons.push("missing_retail");
  if (currentRetail != null && currentRetail < cost) reasons.push("below_cost");
  if (
    currentMarginPct != null &&
    currentMarginPct < minMarginPct &&
    !reasons.includes("below_cost")
  ) {
    reasons.push("thin_margin");
  }
  if (costChangePct != null && costChangePct >= 5) reasons.push("cost_increased");
  if (costChangePct != null && costChangePct <= -5) reasons.push("cost_decreased");

  const highVolume = quantitySold90d >= 8;
  if (
    highVolume &&
    avgSellPrice != null &&
    avgSellPrice > (currentRetail ?? 0) * 1.03
  ) {
    reasons.push("volume_premium");
  }

  const seasonalLiftPct =
    seasonalMultiplier > 1.02
      ? roundMoney((seasonalMultiplier - 1) * 100)
      : null;
  if (seasonalMultiplier > 1.03) reasons.push("seasonal_peak");

  const floor = retailPriceFromCost(cost, minMarginPct);
  const target = retailPriceFromCost(cost, targetMarginPct);

  let recommended = target;
  if (avgSellPrice != null && highVolume) {
    recommended = Math.max(recommended, roundMoney(avgSellPrice * 0.98));
  }
  recommended = Math.max(recommended, floor);
  if (seasonalMultiplier > 1) {
    recommended = roundMoney(
      Math.min(recommended * seasonalMultiplier, recommended * 1.08)
    );
  }
  recommended = roundMoney(recommended);

  if (
    reasons.length === 0 &&
    currentRetail != null &&
    Math.abs(currentRetail - recommended) <= Math.max(50, cost * 0.02)
  ) {
    reasons.push("aligned");
  }

  const severity = severityFromReasons(reasons);

  return {
    productId,
    currentRetail,
    currentCost: cost,
    recommendedRetail: recommended,
    currentMarginPct,
    recommendedMarginPct: marginPctOnCost(cost, recommended),
    avgSellPrice,
    quantitySold90d,
    costChangePct,
    seasonalLiftPct,
    reasons,
    severity,
    summary: buildSummary(reasons, currentRetail, recommended, costChangePct),
    action: buildAction(reasons),
  };
}

/** Market-basket pairs that frequently sell together. */
export function computeProductBundles(input: {
  sales: { saleId: string; productIds: string[] }[];
  productNames: Map<string, string>;
  retailByProduct: Map<string, number>;
  costByProduct: Map<string, number>;
  minCoCount?: number;
  minLift?: number;
}): ProductBundleSuggestion[] {
  const { sales, productNames, retailByProduct, costByProduct } = input;
  const minCoCount = input.minCoCount ?? 3;
  const minLift = input.minLift ?? 1.15;

  const productCount = new Map<string, number>();
  const pairCount = new Map<string, number>();
  const n = sales.length;
  if (n < 5) return [];

  for (const sale of sales) {
    const unique = Array.from(new Set(sale.productIds));
    for (const id of unique) {
      productCount.set(id, (productCount.get(id) ?? 0) + 1);
    }
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const a = unique[i] < unique[j] ? unique[i] : unique[j];
        const b = unique[i] < unique[j] ? unique[j] : unique[i];
        const key = `${a}|${b}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }

  const bundles: ProductBundleSuggestion[] = [];

  for (const [key, coCount] of Array.from(pairCount.entries())) {
    if (coCount < minCoCount) continue;
    const [a, b] = key.split("|");
    const countA = productCount.get(a) ?? 0;
    const countB = productCount.get(b) ?? 0;
    if (countA === 0 || countB === 0) continue;
    const lift = coCount / ((countA / n) * (countB / n) * n);
    if (lift < minLift) continue;

    const retailA = retailByProduct.get(a) ?? 0;
    const retailB = retailByProduct.get(b) ?? 0;
    const costA = costByProduct.get(a) ?? 0;
    const costB = costByProduct.get(b) ?? 0;
    const combinedRetail = roundMoney(retailA + retailB);
    const combinedCost = roundMoney(costA + costB);
    if (combinedRetail <= 0) continue;

    const suggestedBundlePrice = roundMoney(combinedRetail * 0.95);
    const bundleMarginPct =
      combinedCost > 0
        ? marginPctOnCost(combinedCost, suggestedBundlePrice)
        : 0;

    bundles.push({
      productAId: a,
      productAName: productNames.get(a) ?? "Product A",
      productBId: b,
      productBName: productNames.get(b) ?? "Product B",
      coPurchaseCount: coCount,
      lift: roundMoney(lift * 100) / 100,
      combinedRetail,
      combinedCost,
      suggestedBundlePrice,
      bundleMarginPct,
      message: `Bought together ${coCount}× — bundle at ${Math.round(0.95 * 100)}% of combined list for better margin per visit.`,
    });
  }

  return bundles
    .sort((x, y) => y.coPurchaseCount - x.coPurchaseCount)
    .slice(0, 8);
}

export function needsPriceAdjustment(rec: PriceRecommendation): boolean {
  if (rec.severity === "critical" || rec.severity === "warning") return true;
  if (rec.reasons.includes("missing_retail")) return true;
  if (rec.currentRetail == null) return true;
  return (
    Math.abs(rec.currentRetail - rec.recommendedRetail) >
    Math.max(100, rec.currentCost * 0.03)
  );
}
