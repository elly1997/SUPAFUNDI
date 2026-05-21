"use client";

import { TableCell, TableRow } from "@/components/ui/table";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  categoryName: string;
  itemCount: number;
  colSpan: number;
  /** Optional avg margin % when cost/retail known (price list). */
  avgMarginPct?: number | null;
  /** Optional total stock value for category (stock page). */
  stockValue?: number;
};

export function CatalogCategoryTableHeader({
  categoryName,
  itemCount,
  colSpan,
  avgMarginPct,
  stockValue,
}: Props) {
  return (
    <TableRow className="border-t-2 border-primary/20 bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={colSpan} className="py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">{categoryName}</span>
          <span className="text-xs text-muted-foreground">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          {avgMarginPct != null && (
            <span className="text-xs text-muted-foreground">
              Avg margin{" "}
              <span className="font-money font-medium text-foreground">
                {avgMarginPct}%
              </span>
            </span>
          )}
          {stockValue != null && stockValue > 0 && (
            <span className="text-xs text-muted-foreground">
              Cost value{" "}
              <span className="font-money font-medium text-foreground">
                {formatTzs(stockValue)}
              </span>
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function avgMarginForPriceRows(
  rows: { costPrice: number; retailPrice: number }[]
): number | null {
  let costSum = 0;
  let retailSum = 0;
  for (const r of rows) {
    if (r.retailPrice > 0) {
      costSum += r.costPrice;
      retailSum += r.retailPrice;
    }
  }
  if (retailSum <= 0) return null;
  return Math.round(((retailSum - costSum) / retailSum) * 100);
}

export function priceListSectionMargin(
  rows: { costPrice: number; retailPrice: number }[]
): number | null {
  return avgMarginForPriceRows(rows);
}

export function stockSectionValue(
  rows: { stock_value: number }[]
): number {
  return rows.reduce((s, r) => s + r.stock_value, 0);
}
