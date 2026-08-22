import type { StockLevelRow } from "@/lib/actions/stock";
import {
  DEFAULT_COVER_TARGET_DAYS,
  DEFAULT_VELOCITY_LOOKBACK_DAYS,
  hasCoverSurplus,
} from "@/lib/inventory/stock-status";

export type PurchaseSuggestionMode =
  | "balanced"
  | "fast_movers"
  | "low_cover"
  | "depleted";

export type PurchaseSuggestionReason =
  | "low_cover"
  | "fast_mover"
  | "depleted"
  | "below_reorder";

export type PurchaseSuggestionLine = {
  productId: string;
  productName: string;
  code: string | null;
  categoryId: string | null;
  categoryName: string;
  unit: string;
  quantity: number;
  soldInWindow: number;
  avgDailySales: number;
  daysOfCover: number | null;
  reorderPoint: number;
  suggestedQty: number;
  unitCost: number;
  lineCost: number;
  reasons: PurchaseSuggestionReason[];
  urgencyScore: number;
  selected: boolean;
};

export type PurchaseSuggestionOptions = {
  mode?: PurchaseSuggestionMode;
  categoryId?: string | null;
  lookbackDays?: number;
  coverTargetDays?: number;
  minSoldQty?: number;
  maxLines?: number;
};

export type PurchaseSuggestionResult = {
  outletId: string;
  mode: PurchaseSuggestionMode;
  lookbackDays: number;
  coverTargetDays: number;
  lines: PurchaseSuggestionLine[];
  totalEstimatedCost: number;
};

function soldInWindowFromRow(
  row: StockLevelRow,
  lookbackDays: number
): number {
  return roundSold(row.avg_daily_sales * lookbackDays);
}

function roundSold(n: number) {
  return Math.round(n * 1000) / 1000;
}

function reasonLabels(reasons: PurchaseSuggestionReason[]): string[] {
  const map: Record<PurchaseSuggestionReason, string> = {
    low_cover: "Low cover",
    fast_mover: "Fast mover",
    depleted: "Depleted",
    below_reorder: "Below reorder",
  };
  return reasons.map((r) => map[r]);
}

export { reasonLabels };

function buildReasons(
  row: StockLevelRow,
  sold: number,
  coverTargetDays: number,
  lookbackDays: number
): PurchaseSuggestionReason[] {
  const reasons: PurchaseSuggestionReason[] = [];
  const avgDaily = row.avg_daily_sales;
  const hasSales = sold > 0 && avgDaily > 0;

  if (
    hasSales &&
    !hasCoverSurplus(row.quantity, sold, coverTargetDays, lookbackDays)
  ) {
    reasons.push("low_cover");
  }
  if (hasSales && sold >= 10) {
    reasons.push("fast_mover");
  }
  if (row.stock_status === "out_of_stock" || row.stock_status === "low") {
    reasons.push("depleted");
  }
  if (row.reorder_point > 0 && row.quantity <= row.reorder_point) {
    reasons.push("below_reorder");
  }
  return Array.from(new Set(reasons));
}

function urgencyScore(
  row: StockLevelRow,
  sold: number,
  coverTargetDays: number
): number {
  const cover = row.days_of_cover;
  const coverUrgency =
    cover != null && cover > 0 ? coverTargetDays / cover : sold > 0 ? 100 : 1;
  return Math.round((sold + 1) * coverUrgency * 100) / 100;
}

function matchesMode(
  row: StockLevelRow,
  sold: number,
  mode: PurchaseSuggestionMode,
  coverTargetDays: number,
  lookbackDays: number,
  minSoldQty: number
): boolean {
  const hasSales = sold > 0 && row.avg_daily_sales > 0;
  const lowCover =
    hasSales &&
    !hasCoverSurplus(row.quantity, sold, coverTargetDays, lookbackDays);
  const depleted =
    row.stock_status === "out_of_stock" || row.stock_status === "low";

  switch (mode) {
    case "fast_movers":
      return hasSales && sold >= minSoldQty && (lowCover || row.quantity <= 0);
    case "low_cover":
      return lowCover;
    case "depleted":
      return depleted && row.suggested_order_qty > 0;
    case "balanced":
    default:
      if (hasSales && lowCover) return true;
      return false;
  }
}

export function buildPurchaseSuggestionsFromStockRows(
  outletId: string,
  rows: StockLevelRow[],
  options: PurchaseSuggestionOptions = {}
): PurchaseSuggestionResult {
  const mode = options.mode ?? "balanced";
  const lookbackDays = options.lookbackDays ?? DEFAULT_VELOCITY_LOOKBACK_DAYS;
  const coverTargetDays = options.coverTargetDays ?? DEFAULT_COVER_TARGET_DAYS;
  const minSoldQty = options.minSoldQty ?? 1;
  const maxLines = options.maxLines ?? 80;
  const categoryId = options.categoryId ?? null;

  const candidates: PurchaseSuggestionLine[] = [];

  for (const row of rows) {
    if (row.cost_price < 0) continue;
    if (categoryId && row.category_id !== categoryId) continue;

    const sold = soldInWindowFromRow(row, lookbackDays);
    if (row.suggested_order_qty <= 0) continue;
    if (!matchesMode(row, sold, mode, coverTargetDays, lookbackDays, minSoldQty)) {
      continue;
    }

    const reasons = buildReasons(row, sold, coverTargetDays, lookbackDays);
    if (reasons.length === 0) continue;

    const suggestedQty = row.suggested_order_qty;
    candidates.push({
      productId: row.product_id,
      productName: row.product_name,
      code: row.code,
      categoryId: row.category_id,
      categoryName: row.category_name,
      unit: row.unit,
      quantity: row.quantity,
      soldInWindow: sold,
      avgDailySales: row.avg_daily_sales,
      daysOfCover: row.days_of_cover,
      reorderPoint: row.reorder_point,
      suggestedQty,
      unitCost: row.cost_price,
      lineCost: Math.round(suggestedQty * row.cost_price * 100) / 100,
      reasons,
      urgencyScore: urgencyScore(row, sold, coverTargetDays),
      selected: true,
    });
  }

  candidates.sort((a, b) => b.urgencyScore - a.urgencyScore);
  const lines = candidates.slice(0, maxLines);
  const totalEstimatedCost = lines.reduce((s, l) => s + l.lineCost, 0);

  return {
    outletId,
    mode,
    lookbackDays,
    coverTargetDays,
    lines,
    totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
  };
}
