"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { computeDaysOfCover } from "@/lib/inventory/stock-status";
import { cn } from "@/lib/utils";
import { roundStockQty } from "@/lib/utils/calculations";
import { formatTzs } from "@/lib/utils/currency";
import type { PosPricingMode, PosProductRow } from "@/hooks/usePosProducts";

type Props = {
  product: PosProductRow;
  pricingMode?: PosPricingMode;
  cartQty: number;
  /** One-tap / primary add (single-unit SKUs). */
  onAdd: () => void;
  /** Explicit qty / multi-unit path. */
  onQtyClick: () => void;
};

function formatStockQty(qty: number): string {
  return roundStockQty(qty).toLocaleString(undefined, {
    maximumFractionDigits: 3,
  });
}

/** Whole days of cover. Under a day stays explicit so fast movers don't read as zero. */
function formatDaysOnShelf(days: number): string {
  if (days < 1) return "<1 day on shelf";
  const whole = Math.round(days);
  return `~${whole.toLocaleString()} ${whole === 1 ? "day" : "days"} on shelf`;
}

export function PosProductCard({
  product,
  pricingMode = "retail",
  cartQty,
  onAdd,
  onQtyClick,
}: Props) {
  const outOfStock = product.stockQty <= 0;
  const lowStock = !outOfStock && product.stockQty <= 5;
  const daysOnShelf = outOfStock
    ? null
    : computeDaysOfCover(product.stockQty, product.avgDailySold);
  const runningLow = daysOnShelf != null && daysOnShelf < 7;
  const demandLabel =
    product.recentSoldQty > 0
      ? `${product.recentSoldQty.toLocaleString()} sold / 30d`
      : null;

  return (
    <div
      className={cn(
        "group relative flex min-h-[7rem] flex-col rounded-xl border bg-card p-2.5 shadow-sm transition-all",
        "hover:border-primary/40 hover:shadow-md",
        cartQty > 0 && "border-primary/50 ring-2 ring-primary/20",
        outOfStock && "opacity-45 grayscale"
      )}
    >
      {cartQty > 0 && (
        <span className="absolute -right-1 -top-1 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground shadow-md">
          {cartQty}
        </span>
      )}
      <button
        type="button"
        disabled={outOfStock}
        onClick={onAdd}
        className={cn(
          "flex min-h-0 flex-1 flex-col text-left touch-manipulation active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl",
          outOfStock && "cursor-not-allowed"
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {product.name}
          </span>
          <span
            className={cn(
              "mt-1 block text-[11px] leading-snug tabular-nums text-muted-foreground",
              outOfStock && "text-outflow",
              lowStock && "text-warning"
            )}
          >
            {outOfStock
              ? "Out of stock"
              : `${formatStockQty(product.stockQty)} ${product.unit} in stock`}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
            {!outOfStock && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-semibold",
                  daysOnShelf == null
                    ? "bg-muted text-muted-foreground"
                    : runningLow
                      ? "bg-warning/15 text-warning"
                      : "bg-primary/10 text-primary"
                )}
                title={
                  daysOnShelf != null
                    ? `${formatStockQty(product.stockQty)} ${product.unit} ÷ ~${product.avgDailySold}/day`
                    : undefined
                }
              >
                {daysOnShelf != null
                  ? formatDaysOnShelf(daysOnShelf)
                  : "No recent sales"}
              </span>
            )}
            {product.avgDailySold > 0 && (
              <span className="text-muted-foreground">
                ~{product.avgDailySold}/day
                {demandLabel ? ` · ${demandLabel}` : ""}
              </span>
            )}
          </span>
        </span>
        <span
          className={cn(
            "mt-1.5 block font-money text-base font-bold tabular-nums tracking-tight",
            pricingMode === "wholesale" ? "text-info" : "text-primary"
          )}
        >
          {formatTzs(product.displayPrice)}
        </span>
      </button>
      {!outOfStock && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pos-touch mt-2 min-h-11 w-full rounded-lg text-xs font-semibold"
          onClick={(e) => {
            e.stopPropagation();
            onQtyClick();
          }}
        >
          <Plus className="mr-1 size-3.5" />
          Qty / unit
        </Button>
      )}
    </div>
  );
}
