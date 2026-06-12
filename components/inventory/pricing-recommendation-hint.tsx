"use client";

import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PriceRecommendation } from "@/lib/analytics/pricing-insights";
import { needsPriceAdjustment } from "@/lib/analytics/pricing-insights";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  recommendation: PriceRecommendation | null | undefined;
  isLoading?: boolean;
  compact?: boolean;
  onApplyPrice?: (price: number) => void;
  applying?: boolean;
};

export function PricingRecommendationHint({
  recommendation,
  isLoading,
  compact,
  onApplyPrice,
  applying,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Analysing price…
      </div>
    );
  }

  if (!recommendation) return null;

  const showAdjust = needsPriceAdjustment(recommendation);
  if (!showAdjust && compact) return null;

  const severity = recommendation.severity;
  const costUp = (recommendation.costChangePct ?? 0) > 0;
  const costDown = (recommendation.costChangePct ?? 0) < 0;

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        severity === "critical" && "border-outflow/50 bg-outflow/10",
        severity === "warning" && "border-warning/40 bg-warning/10",
        severity === "info" && "border-info/30 bg-info/5",
        severity === "none" && "border-border/60 bg-surface-1/40"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-primary" />
          <span className="font-medium">Suggested selling price</span>
        </div>
        <span className="font-money text-base font-bold tabular-nums text-primary">
          {formatTzs(recommendation.recommendedRetail)}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
        {recommendation.summary}
      </p>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {recommendation.currentRetail != null ? (
          <span>
            Current:{" "}
            <span className="font-money">{formatTzs(recommendation.currentRetail)}</span>
            {recommendation.currentMarginPct != null
              ? ` (${recommendation.currentMarginPct}% margin)`
              : ""}
          </span>
        ) : null}
        <span>
          Target margin: {recommendation.recommendedMarginPct}%
        </span>
        {recommendation.quantitySold90d > 0 ? (
          <span>{recommendation.quantitySold90d} sold (90d)</span>
        ) : null}
        {recommendation.avgSellPrice != null ? (
          <span>Avg sell: {formatTzs(recommendation.avgSellPrice)}</span>
        ) : null}
        {recommendation.costChangePct != null ? (
          <span className="inline-flex items-center gap-0.5">
            Cost trend:
            {costUp ? (
              <TrendingUp className="size-3 text-outflow" />
            ) : costDown ? (
              <TrendingDown className="size-3 text-inflow" />
            ) : null}
            {recommendation.costChangePct > 0 ? "+" : ""}
            {recommendation.costChangePct}%
          </span>
        ) : null}
        {recommendation.seasonalLiftPct != null ? (
          <span className="text-warning">
            Seasonal +{recommendation.seasonalLiftPct}%
          </span>
        ) : null}
      </div>

      {onApplyPrice && showAdjust ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-8"
          disabled={applying}
          onClick={() => onApplyPrice(recommendation.recommendedRetail)}
        >
          {applying ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : null}
          Apply {formatTzs(recommendation.recommendedRetail)}
        </Button>
      ) : null}
    </div>
  );
}
