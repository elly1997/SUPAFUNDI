"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import type { PosPricingMode, PosProductRow } from "@/hooks/usePosProducts";

type Props = {
  product: PosProductRow;
  pricingMode?: PosPricingMode;
  cartQty: number;
  onAdd: () => void;
  onQtyClick: () => void;
};

export function PosProductCard({
  product,
  pricingMode = "retail",
  cartQty,
  onAdd,
  onQtyClick,
}: Props) {
  const outOfStock = product.stockQty <= 0;

  return (
    <div
      className={cn(
        "group relative flex min-h-[6.25rem] flex-col rounded-xl border bg-card p-2 shadow-sm transition-all",
        "hover:border-primary/40 hover:shadow-md",
        cartQty > 0 && "border-primary/50 ring-2 ring-primary/20",
        outOfStock && "opacity-45 grayscale"
      )}
    >
      {cartQty > 0 && (
        <span className="absolute -right-1 -top-1 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-md">
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
          <span className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
            {product.name}
          </span>
          <span className="mt-1 block truncate text-[10px] font-medium text-muted-foreground">
            {product.code ?? "No SKU"} ·{" "}
            <span
              className={cn(
                product.stockQty <= 5 && product.stockQty > 0 && "text-warning",
                outOfStock && "text-outflow"
              )}
            >
              {outOfStock ? "Out of stock" : `${product.stockQty} ${product.unit}`}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "mt-1 block font-money text-sm font-bold tabular-nums tracking-tight",
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
          className="mt-1.5 min-h-8 w-full rounded-lg text-[11px] font-semibold lg:min-h-8"
          onClick={(e) => {
            e.stopPropagation();
            onQtyClick();
          }}
        >
          <Plus className="mr-1 size-3.5" />
          Qty
        </Button>
      )}
    </div>
  );
}
