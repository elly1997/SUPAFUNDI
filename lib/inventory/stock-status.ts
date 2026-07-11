import { roundStockQty } from "@/lib/utils/calculations";

export type StockStatus = "out_of_stock" | "low" | "ok";

export function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (reorder > 0 && qty <= reorder) return "low";
  return "ok";
}

/** Target purchase qty to bring stock back to a sensible level. */
export function computeSuggestedOrderQty(
  qty: number,
  reorder: number,
  sold30 = 0
): number {
  const onHand = roundStockQty(qty);
  const reorderLevel = roundStockQty(reorder);

  if (reorderLevel > 0) {
    const targetQty = Math.max(reorderLevel * 2, reorderLevel);
    return Math.max(0, roundStockQty(targetQty - onHand));
  }

  if (onHand <= 0) {
    const velocity = roundStockQty(sold30);
    if (velocity > 0) return Math.max(1, velocity);
    return 1;
  }

  return 0;
}

export function needsReplenishment(
  qty: number,
  reorder: number,
  sold30 = 0
): boolean {
  const status = stockStatus(qty, reorder);
  if (status === "ok") return false;
  return computeSuggestedOrderQty(qty, reorder, sold30) > 0;
}
