"use client";

import { Link2, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductBundleSuggestion } from "@/lib/analytics/pricing-insights";
import type { PriceRecommendation } from "@/lib/analytics/pricing-insights";
import { needsPriceAdjustment } from "@/lib/analytics/pricing-insights";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  bundles: ProductBundleSuggestion[];
  priceAdjustments?: PriceRecommendation[];
};

export function BundleInsightsPanel({ bundles, priceAdjustments = [] }: Props) {
  const urgent = priceAdjustments.filter(
    (r) => needsPriceAdjustment(r) && r.severity !== "none"
  );

  if (bundles.length === 0 && urgent.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-5 text-primary" />
            Bundles &amp; pricing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Complete more multi-item sales to discover products that move together
            and receive pricing suggestions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {urgent.length > 0 ? (
        <Card className="glass-card border-warning/30">
          <CardHeader>
            <CardTitle className="text-base">Price adjustments needed</CardTitle>
            <p className="text-sm text-muted-foreground">
              Selling price vs buying cost, volume, and seasonality.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {urgent.slice(0, 6).map((r) => (
              <div
                key={r.productId}
                className="rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {r.productName ? `${r.productName}: ` : ""}
                    {r.summary}
                  </span>
                  <span className="font-money text-xs font-semibold text-primary">
                    → {formatTzs(r.recommendedRetail)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{r.action}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {bundles.length > 0 ? (
        <Card className="glass-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-5 text-primary" />
              Correlated products — bundle opportunities
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Items often bought in the same sale. Bundle at ~5% below combined list
              while keeping margin.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {bundles.map((b) => (
              <div
                key={`${b.productAId}-${b.productBId}`}
                className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm"
              >
                <p className="font-medium">
                  {b.productAName}{" "}
                  <span className="text-muted-foreground">+</span> {b.productBName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{b.message}</p>
                <div className="mt-2 flex flex-wrap gap-3 font-money text-xs">
                  <span>List: {formatTzs(b.combinedRetail)}</span>
                  <span className="text-primary font-semibold">
                    Bundle: {formatTzs(b.suggestedBundlePrice)}
                  </span>
                  <span className="text-muted-foreground">
                    Margin {b.bundleMarginPct}% · {b.coPurchaseCount}× together
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
