import type { StockLevelRow } from "@/lib/actions/stock";
import {
  DEFAULT_COVER_TARGET_DAYS,
  DEFAULT_VELOCITY_LOOKBACK_DAYS,
  hasCoverSurplus,
} from "@/lib/inventory/stock-status";

/** No completed sales in this many days = dead stock. */
export const DEAD_STOCK_DAYS = 90;

export type PurchaseSuggestionMode =
  | "balanced"
  | "fast_movers"
  | "low_cover"
  | "depleted"
  | "dead_stock";

export type PurchaseSuggestionSort = "velocity_desc" | "name_asc";

export type PurchaseSuggestionReason =
  | "low_cover"
  | "fast_mover"
  | "depleted"
  | "below_reorder"
  | "dead_stock";

export type PurchaseSuggestionLine = {
  productId: string;
  productName: string;
  code: string | null;
  categoryId: string | null;
  categoryName: string;
  unit: string;
  quantity: number;
  soldInWindow: number;
  /** Units sold in the last 90 days (dead-stock check). */
  sold90: number;
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
  sort?: PurchaseSuggestionSort;
  /** product_id → qty sold in last DEAD_STOCK_DAYS days */
  sold90ByProductId?: Map<string, number> | Record<string, number>;
};

export type PurchaseSuggestionResult = {
  outletId: string;
  mode: PurchaseSuggestionMode;
  lookbackDays: number;
  coverTargetDays: number;
  sort: PurchaseSuggestionSort;
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

function sold90Lookup(
  productId: string,
  sold90ByProductId?: Map<string, number> | Record<string, number>
): number {
  if (!sold90ByProductId) return 0;
  if (sold90ByProductId instanceof Map) {
    return Number(sold90ByProductId.get(productId) ?? 0);
  }
  return Number(sold90ByProductId[productId] ?? 0);
}

function reasonLabels(reasons: PurchaseSuggestionReason[]): string[] {
  const map: Record<PurchaseSuggestionReason, string> = {
    low_cover: "Low cover",
    fast_mover: "Fast mover",
    depleted: "Depleted",
    below_reorder: "Below reorder",
    dead_stock: "Dead stock",
  };
  return reasons.map((r) => map[r]);
}

export { reasonLabels };

export function sortPurchaseSuggestionLines(
  lines: PurchaseSuggestionLine[],
  sort: PurchaseSuggestionSort
): PurchaseSuggestionLine[] {
  const copy = [...lines];
  if (sort === "name_asc") {
    copy.sort((a, b) =>
      a.productName.localeCompare(b.productName, undefined, {
        sensitivity: "base",
      })
    );
  } else {
    copy.sort((a, b) => {
      if (b.soldInWindow !== a.soldInWindow) {
        return b.soldInWindow - a.soldInWindow;
      }
      if (b.urgencyScore !== a.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      return a.productName.localeCompare(b.productName, undefined, {
        sensitivity: "base",
      });
    });
  }
  return copy;
}

function buildReasons(
  row: StockLevelRow,
  sold: number,
  sold90: number,
  coverTargetDays: number,
  lookbackDays: number,
  mode: PurchaseSuggestionMode
): PurchaseSuggestionReason[] {
  const reasons: PurchaseSuggestionReason[] = [];
  const avgDaily = row.avg_daily_sales;
  const hasSales = sold > 0 && avgDaily > 0;

  if (mode === "dead_stock" || (row.quantity > 0 && sold90 <= 0)) {
    if (row.quantity > 0 && sold90 <= 0) {
      reasons.push("dead_stock");
    }
  }
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
  sold90: number,
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
    case "dead_stock":
      /** On hand, zero sales in 90+ days. */
      return row.quantity > 0 && sold90 <= 0;
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
  const maxLines = options.maxLines ?? (mode === "dead_stock" ? 200 : 80);
  const categoryId = options.categoryId ?? null;
  const sort = options.sort ?? "velocity_desc";

  const candidates: PurchaseSuggestionLine[] = [];

  for (const row of rows) {
    if (row.cost_price < 0) continue;
    if (categoryId && row.category_id !== categoryId) continue;

    const sold = soldInWindowFromRow(row, lookbackDays);
    const sold90 = sold90Lookup(row.product_id, options.sold90ByProductId);

    if (mode !== "dead_stock" && row.suggested_order_qty <= 0) continue;
    if (
      !matchesMode(
        row,
        sold,
        sold90,
        mode,
        coverTargetDays,
        lookbackDays,
        minSoldQty
      )
    ) {
      continue;
    }

    const reasons = buildReasons(
      row,
      sold,
      sold90,
      coverTargetDays,
      lookbackDays,
      mode
    );
    if (reasons.length === 0) continue;

    const isDead = mode === "dead_stock";
    const suggestedQty = isDead ? 0 : row.suggested_order_qty;
    candidates.push({
      productId: row.product_id,
      productName: row.product_name,
      code: row.code,
      categoryId: row.category_id,
      categoryName: row.category_name,
      unit: row.unit,
      quantity: row.quantity,
      soldInWindow: isDead ? sold90 : sold,
      sold90,
      avgDailySales: row.avg_daily_sales,
      daysOfCover: row.days_of_cover,
      reorderPoint: row.reorder_point,
      suggestedQty,
      unitCost: row.cost_price,
      lineCost: Math.round(suggestedQty * row.cost_price * 100) / 100,
      reasons,
      urgencyScore: isDead
        ? row.quantity * Math.max(row.cost_price, 1)
        : urgencyScore(row, sold, coverTargetDays),
      /** Dead stock is review-only by default — do not auto-order. */
      selected: !isDead,
    });
  }

  const sorted = sortPurchaseSuggestionLines(candidates, sort);
  const lines = sorted.slice(0, maxLines);
  const totalEstimatedCost = lines
    .filter((l) => l.selected)
    .reduce((s, l) => s + l.lineCost, 0);

  return {
    outletId,
    mode,
    lookbackDays: mode === "dead_stock" ? DEAD_STOCK_DAYS : lookbackDays,
    coverTargetDays,
    sort,
    lines,
    totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
  };
}
