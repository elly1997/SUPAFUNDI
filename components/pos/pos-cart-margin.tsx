"use client";

import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import type { CartMarginSummary } from "@/lib/utils/cart-margin";

type Props = {
  margin: CartMarginSummary;
  listMargin?: CartMarginSummary | null;
  showListComparison?: boolean;
};

function marginTone(marginPct: number, grossProfit: number): string {
  if (grossProfit < 0) return "text-destructive";
  if (marginPct < 10) return "text-warning";
  return "text-emerald-400";
}

export function PosCartMargin({
  margin,
  listMargin,
  showListComparison = false,
}: Props) {
  const tone = marginTone(margin.marginPct, margin.grossProfit);
  const partial = margin.linesWithCost < margin.lineCount;

  return (
    <div className="rounded-lg border border-border/80 bg-muted/30 px-2.5 py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <TrendingUp className="size-3.5 text-primary" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Est. margin
        </span>
      </div>

      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Cost</span>
          <span className="font-money tabular-nums text-foreground">
            {formatTzs(margin.cogs)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Profit</span>
          <span className={cn("font-money tabular-nums font-semibold", tone)}>
            {formatTzs(margin.grossProfit)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">Margin</span>
          <span className={cn("font-money tabular-nums font-bold", tone)}>
            {margin.marginPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {showListComparison && listMargin && listMargin.marginPct !== margin.marginPct ? (
        <p className="form-hint mt-1.5 text-[10px] leading-snug">
          List price margin{" "}
          <span className="font-money font-semibold text-foreground">
            {listMargin.marginPct.toFixed(1)}%
          </span>
          {" · "}
          discount costs{" "}
          <span className="font-money font-semibold text-warning">
            {formatTzs(listMargin.grossProfit - margin.grossProfit)}
          </span>
        </p>
      ) : null}

      {partial ? (
        <p className="form-hint mt-1 text-[10px] leading-snug">
          Cost known for {margin.linesWithCost}/{margin.lineCount} line(s) — set
          buying price in inventory for full estimate.
        </p>
      ) : null}
    </div>
  );
}
