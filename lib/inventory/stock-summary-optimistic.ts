import type { StockLevelsSummary, StockLevelRow } from "@/lib/actions/stock";
import { stockStatus } from "@/lib/inventory/stock-status";
import { roundMoney } from "@/lib/utils/calculations";

export type StockSummaryChange = {
  kind: "quantity" | "costPrice" | "retailPrice";
  numericValue: number;
};

function adjustStatusCounts(
  summary: StockLevelsSummary,
  reorder: number,
  oldQty: number,
  newQty: number
): Pick<StockLevelsSummary, "lowStockCount" | "outOfStockCount" | "skusWithQty"> {
  const oldStatus = stockStatus(oldQty, reorder);
  const newStatus = stockStatus(newQty, reorder);
  let { lowStockCount, outOfStockCount, skusWithQty } = summary;

  if (oldStatus === "low" && newStatus !== "low") lowStockCount -= 1;
  if (oldStatus !== "low" && newStatus === "low") lowStockCount += 1;
  if (oldStatus === "out_of_stock" && newStatus !== "out_of_stock") {
    outOfStockCount -= 1;
  }
  if (oldStatus !== "out_of_stock" && newStatus === "out_of_stock") {
    outOfStockCount += 1;
  }
  if (oldQty <= 0 && newQty > 0) skusWithQty += 1;
  if (oldQty > 0 && newQty <= 0) skusWithQty -= 1;

  return { lowStockCount, outOfStockCount, skusWithQty };
}

/** Apply a single row edit to outlet-wide summary totals (client optimistic). */
export function applyStockChangeToSummary(
  prev: StockLevelsSummary | undefined,
  change: StockSummaryChange,
  row: StockLevelRow
): StockLevelsSummary | undefined {
  if (!prev) return prev;

  if (change.kind === "costPrice") {
    if (row.quantity <= 0) return prev;
    return {
      ...prev,
      totalValue: roundMoney(
        prev.totalValue + row.quantity * (change.numericValue - row.cost_price)
      ),
    };
  }

  if (change.kind === "retailPrice") {
    if (row.quantity <= 0) return prev;
    return {
      ...prev,
      totalRetailValue: roundMoney(
        prev.totalRetailValue +
          row.quantity * (change.numericValue - row.retail_price)
      ),
    };
  }

  const oldQty = row.quantity;
  const newQty = change.numericValue;
  const cost = row.cost_price;
  const retail = row.retail_price;

  return {
    ...prev,
    ...adjustStatusCounts(prev, row.reorder_point, oldQty, newQty),
    totalValue: roundMoney(prev.totalValue + (newQty - oldQty) * cost),
    totalRetailValue: roundMoney(
      prev.totalRetailValue + (newQty - oldQty) * retail
    ),
  };
}
