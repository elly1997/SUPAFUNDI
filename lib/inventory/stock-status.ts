export type StockStatus = "out_of_stock" | "low" | "ok";

export function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (reorder > 0 && qty <= reorder) return "low";
  return "ok";
}
