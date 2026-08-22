import { roundStockQty } from "@/lib/utils/calculations";

export type StockStatus = "out_of_stock" | "low" | "ok";

/** Default sales lookback and cover target (30-day surplus rule). */
export const DEFAULT_VELOCITY_LOOKBACK_DAYS = 30;
export const DEFAULT_COVER_TARGET_DAYS = 30;

export function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (reorder > 0 && qty <= reorder) return "low";
  return "ok";
}

export function computeAvgDailySales(
  soldInWindow: number,
  lookbackDays = DEFAULT_VELOCITY_LOOKBACK_DAYS
): number {
  if (lookbackDays <= 0) return 0;
  return roundStockQty(soldInWindow / lookbackDays);
}

export function computeDaysOfCover(
  qty: number,
  avgDaily: number
): number | null {
  if (avgDaily <= 0) return null;
  return Math.round((qty / avgDaily) * 10) / 10;
}

/** True when on-hand already covers the target window at current sell rate. */
export function hasCoverSurplus(
  qty: number,
  soldInWindow: number,
  coverTargetDays = DEFAULT_COVER_TARGET_DAYS,
  lookbackDays = DEFAULT_VELOCITY_LOOKBACK_DAYS
): boolean {
  const avgDaily = computeAvgDailySales(soldInWindow, lookbackDays);
  if (avgDaily <= 0) return qty > 0;
  const daysCover = computeDaysOfCover(qty, avgDaily);
  return daysCover != null && daysCover >= coverTargetDays;
}

/**
 * Target purchase qty to reach `coverTargetDays` of stock at current velocity.
 * When reorder is set, uses the higher of velocity gap and reorder top-up.
 */
export function computeSuggestedOrderQty(
  qty: number,
  reorder: number,
  soldInWindow = 0,
  coverTargetDays = DEFAULT_COVER_TARGET_DAYS,
  lookbackDays = DEFAULT_VELOCITY_LOOKBACK_DAYS
): number {
  const onHand = roundStockQty(qty);
  const reorderLevel = roundStockQty(reorder);
  const avgDaily = computeAvgDailySales(soldInWindow, lookbackDays);

  let velocityGap = 0;
  if (avgDaily > 0) {
    const targetQty = Math.ceil(avgDaily * coverTargetDays);
    velocityGap = Math.max(0, roundStockQty(targetQty - onHand));
  }

  let reorderGap = 0;
  if (reorderLevel > 0) {
    const targetQty = Math.max(reorderLevel * 2, reorderLevel);
    reorderGap = Math.max(0, roundStockQty(targetQty - onHand));
  }

  if (avgDaily > 0) {
    return Math.max(velocityGap, reorderGap);
  }

  if (reorderLevel > 0) {
    return reorderGap;
  }

  if (onHand <= 0) {
    return soldInWindow > 0 ? Math.max(1, roundStockQty(soldInWindow)) : 1;
  }

  return 0;
}

export function needsReplenishment(
  qty: number,
  reorder: number,
  soldInWindow = 0,
  coverTargetDays = DEFAULT_COVER_TARGET_DAYS,
  lookbackDays = DEFAULT_VELOCITY_LOOKBACK_DAYS
): boolean {
  if (hasCoverSurplus(qty, soldInWindow, coverTargetDays, lookbackDays)) {
    return false;
  }
  return (
    computeSuggestedOrderQty(
      qty,
      reorder,
      soldInWindow,
      coverTargetDays,
      lookbackDays
    ) > 0
  );
}
