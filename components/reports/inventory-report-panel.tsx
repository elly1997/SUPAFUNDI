"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Boxes, Loader2, Package, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

export function InventoryReportPanel() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [preset, setPreset] = useState<InventoryReportPreset>("1M");
  const range = useMemo(() => resolveInventoryReportRange(preset), [preset]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["inventory-analytics", preset, outletId],
    queryFn: () => getInventoryAnalyticsReport(preset, outletId),
    staleTime: 120_000,
  });

  const chartData = useMemo(
    () =>
      (data?.stockValueSeries ?? []).map((p) => ({
        ...p,
        label: format(parseISO(p.date), "d MMM"),
      })),
    [data?.stockValueSeries]
  );

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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Stock value (cost)"
              value={formatTzs(data.closingStockValue)}
              subtitle={
                data.stockValueChangePct >= 0
                  ? `+${data.stockValueChangePct}% vs period start`
                  : `${data.stockValueChangePct}% vs period start`
              }
              icon={data.stockValueChangePct >= 0 ? TrendingUp : TrendingDown}
              variant={data.stockValueChangePct >= 0 ? "inflow" : "outflow"}
              className="glass-card"
            />
            <KpiCard
              title="Opening value"
              value={formatTzs(data.openingStockValue)}
              subtitle={`At ${data.from}`}
              className="glass-card"
            />
            <KpiCard
              title="Low stock alerts"
              value={String(data.lowStockCount)}
              subtitle="At or below reorder level"
              variant="warning"
              className="glass-card"
            />
            <Card className="glass-card flex flex-col justify-center p-4">
              <Link
                href="/inventory/stock"
                className={cn(buttonVariants({ variant: "default" }), "w-full")}
              >
                <Package className="mr-2 size-4" />
                View stock
              </Link>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="size-5 text-primary" />
                Stock value over time
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Rebuilt from daily POS stock movements and current costs (TZS at
                cost; orange curve = retail value if prices are set).
              </p>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No movement history in this range yet.
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        opacity={0.4}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        tickFormatter={(v) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(1)}M`
                            : String(v)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                        formatter={(value, name) => [
                          formatTzs(Number(value ?? 0)),
                          String(name) === "value" ? "At cost" : "At retail",
                        ]}
                        labelFormatter={(label) => label}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name="At cost"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="retailValue"
                        name="At retail"
                        stroke="hsl(var(--warning))"
                        strokeWidth={2}
                        dot={false}
                        strokeDasharray="4 4"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
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
