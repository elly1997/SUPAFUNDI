"use client";

import { useQuery } from "@tanstack/react-query";
import { Boxes, Loader2, Package, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StockValueTrendChart } from "@/components/reports/report-charts";
import { BundleInsightsPanel } from "@/components/reports/bundle-insights-panel";
import { SeasonalInsightsPanel } from "@/components/reports/seasonal-insights-panel";
import { fetchPricingInsights } from "@/lib/api/pricing-insights-fetch";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { getInventoryAnalyticsReport } from "@/lib/actions/inventory-reports";
import {
  INVENTORY_REPORT_PRESETS,
  resolveInventoryReportRange,
  type InventoryReportPreset,
} from "@/lib/inventory/report-range";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

function CategoryRankList({
  rows,
  valueKey,
  formatValue,
}: {
  rows: {
    categoryName: string;
    revenue: number;
    margin: number;
    marginPct: number;
    avgDaysOnShelf: number | null;
  }[];
  valueKey: "revenue" | "marginPct" | "avgDaysOnShelf";
  formatValue: (row: (typeof rows)[0]) => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No category sales in this period yet. Sales at POS will populate this
        report.
      </p>
    );
  }
  const max =
    valueKey === "revenue"
      ? Math.max(...rows.map((r) => r.revenue), 1)
      : valueKey === "marginPct"
        ? 100
        : Math.max(
            ...rows.map((r) => (r.avgDaysOnShelf != null ? r.avgDaysOnShelf : 0)),
            1
          );

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const raw =
          valueKey === "revenue"
            ? row.revenue
            : valueKey === "marginPct"
              ? row.marginPct
              : row.avgDaysOnShelf ?? 0;
        const pct = Math.min(100, (raw / max) * 100);
        return (
          <div key={`${row.categoryName}-${i}`} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>
                {i + 1}. {row.categoryName}
              </span>
              <span className="font-money font-semibold tabular-nums">
                {formatValue(row)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-1">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  valueKey === "marginPct"
                    ? "bg-inflow"
                    : valueKey === "avgDaysOnShelf"
                      ? "bg-info"
                      : "bg-primary"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type InventoryReportPanelProps = {
  enabled?: boolean;
};

export function InventoryReportPanel({ enabled = true }: InventoryReportPanelProps) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [preset, setPreset] = useState<InventoryReportPreset>("1M");
  const range = useMemo(() => resolveInventoryReportRange(preset), [preset]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["inventory-analytics", preset, outletId],
    queryFn: () => getInventoryAnalyticsReport(preset, outletId),
    enabled: enabled && !!outletId,
    staleTime: 120_000,
  });

  const { data: pricingData } = useQuery({
    queryKey: ["pricing-insights", "inventory", outletId],
    queryFn: () => fetchPricingInsights({ outletId }),
    enabled: enabled && !!outletId,
    staleTime: 120_000,
  });

  if (!outletId) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Select an active outlet in the header to view inventory analytics for
          that branch.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {INVENTORY_REPORT_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            className={cn(
              "min-h-10 rounded-xl px-4",
              preset === p.id && "shadow-md"
            )}
            onClick={() => setPreset(p.id)}
            title={p.description}
          >
            {p.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {range.from} → {range.to}
          {isFetching && !isLoading ? " · updating…" : ""}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => void refetch()}
        >
          Refresh
        </Button>
      </div>

      {isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-10 animate-spin text-primary" />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <KpiCard
              title="Stock on hand (cost)"
              value={formatTzs(data.closingStockValue)}
              subtitle={`${data.skusWithQty} SKUs with qty · matches Stock & prices`}
              icon={Boxes}
              className="glass-card"
            />
            <KpiCard
              title="Stock on hand (retail)"
              value={formatTzs(data.closingRetailStockValue)}
              subtitle={
                data.retailStockValueChangePct >= 0
                  ? `+${data.retailStockValueChangePct}% vs period start`
                  : `${data.retailStockValueChangePct}% vs period start`
              }
              icon={Wallet}
              className="glass-card"
            />
            <KpiCard
              title="Potential margin"
              value={formatTzs(data.potentialMargin)}
              subtitle="Retail value minus cost value (on hand)"
              variant={data.potentialMargin >= 0 ? "inflow" : "outflow"}
              className="glass-card"
            />
            <KpiCard
              title="Stock build-up (cost)"
              value={formatTzs(data.stockBuildUpCost)}
              subtitle={
                data.stockBuildUpCost >= 0
                  ? `+${data.stockValueChangePct}% capital in inventory`
                  : `${data.stockValueChangePct}% draw-down in period`
              }
              icon={data.stockBuildUpCost >= 0 ? TrendingUp : TrendingDown}
              variant={data.stockBuildUpCost >= 0 ? "warning" : "inflow"}
              className="glass-card"
            />
            <KpiCard
              title="Period opening (cost)"
              value={formatTzs(data.openingStockValue)}
              subtitle={`At ${data.from} · retail ${formatTzs(data.openingRetailStockValue)}`}
              className="glass-card"
            />
            <KpiCard
              title="Low stock alerts"
              value={String(data.lowStockCount)}
              subtitle="At or below reorder level"
              variant="warning"
              className="glass-card"
            />
          </div>

          <Card className="glass-card">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <p className="text-sm text-muted-foreground">
                Values use live outlet stock (same as Stock &amp; prices). Trend
                rebuilds daily quantities from movements, reconciled to today.
              </p>
              <Link
                href="/inventory/stock"
                className={cn(buttonVariants({ variant: "default" }), "shrink-0")}
              >
                <Package className="mr-2 size-4" />
                View stock
              </Link>
            </CardContent>
          </Card>

          <SeasonalInsightsPanel
            seasonal={data.seasonal}
            categoryTrends={data.categorySeasonalTrends}
            insights={data.seasonalInsights}
            title="Inventory & seasonal insights"
            subtitle="When to buy, what to stock, and how inventory ties to sales rhythms."
          />

          <BundleInsightsPanel
            bundles={pricingData?.bundles ?? []}
            priceAdjustments={pricingData?.recommendations ?? []}
          />

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="size-5 text-primary" />
                Stock value over time
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Daily stock value from movement history, anchored to current
                on-hand quantities. Cost and retail curves reflect price changes
                when recorded on stock movements.
              </p>
            </CardHeader>
            <CardContent>
              {data.stockValueSeries.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No movement history in this range yet.
                </p>
              ) : (
                <StockValueTrendChart data={data.stockValueSeries} height={300} />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Top categories by sales</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryRankList
                  rows={data.categoriesBySales}
                  valueKey="revenue"
                  formatValue={(r) => formatTzs(r.revenue)}
                />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Top categories by margin</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryRankList
                  rows={data.categoriesByMargin}
                  valueKey="marginPct"
                  formatValue={(r) =>
                    `${r.marginPct}% (${formatTzs(r.margin)})`
                  }
                />
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Shelf life (fast → slow)</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Days of cover from POS sales velocity — lower is faster moving.
                </p>
              </CardHeader>
              <CardContent>
                <CategoryRankList
                  rows={data.categoriesByVelocity}
                  valueKey="avgDaysOnShelf"
                  formatValue={(r) =>
                    r.avgDaysOnShelf != null
                      ? `${r.avgDaysOnShelf} days`
                      : "No sales"
                  }
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Fast-moving items</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Highest unit sales in period — use for purchase planning and shelf
                  checks.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.fastMovingProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Complete POS sales to see fast movers.
                  </p>
                ) : (
                  data.fastMovingProducts.map((p, i) => (
                    <div
                      key={p.productId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {i + 1}. {p.productName}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.categoryName}
                        </span>
                      </div>
                      <div className="text-right font-money text-xs">
                        <div>{p.quantitySold} sold · {formatTzs(p.revenue)}</div>
                        <div className="text-muted-foreground">
                          {p.daysOnShelf != null
                            ? `~${p.daysOnShelf} days on shelf`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Purchase allocation hints</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Suggestions from sales, margin, and turnover — adjust reorder levels
                  under Products.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.purchaseHints.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Not enough data yet — keep selling on POS to build hints.
                  </p>
                ) : (
                  data.purchaseHints.map((h, i) => (
                    <div
                      key={`${h.categoryName}-${i}`}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-sm",
                        h.priority === "high" &&
                          "border-warning/40 bg-warning/10",
                        h.priority === "medium" &&
                          "border-primary/30 bg-primary/5",
                        h.priority === "low" &&
                          "border-border/60 bg-surface-1/30"
                      )}
                    >
                      <span
                        className={cn(
                          "mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          h.priority === "high" && "bg-warning/20 text-warning",
                          h.priority === "medium" && "bg-primary/20 text-primary",
                          h.priority === "low" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {h.priority}
                      </span>
                      <span className="font-medium">{h.categoryName}:</span>{" "}
                      {h.message}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
