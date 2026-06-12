"use client";

import {
  CalendarRange,
  CloudSun,
  Info,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeekdayPatternChart } from "@/components/reports/report-charts";
import type {
  CategorySeasonalTrend,
  SeasonalAnalysis,
  SeasonalInsight,
} from "@/lib/analytics/seasonal-insights";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  seasonal: SeasonalAnalysis;
  categoryTrends?: CategorySeasonalTrend[];
  insights?: SeasonalInsight[];
  title?: string;
  subtitle?: string;
};

function TendencyBadge({ tendency }: { tendency: "peak" | "quiet" | "normal" }) {
  if (tendency === "peak") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
        <TrendingUp className="size-3" />
        Peak
      </span>
    );
  }
  if (tendency === "quiet") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
        <TrendingDown className="size-3" />
        Quiet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-info">
      Normal
    </span>
  );
}

function InsightCard({ insight }: { insight: SeasonalInsight }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        insight.severity === "positive" && "border-inflow/30 bg-inflow/5",
        insight.severity === "warning" && "border-warning/40 bg-warning/10",
        insight.severity === "info" && "border-border/60 bg-surface-1/40"
      )}
    >
      <p className="font-semibold">{insight.title}</p>
      <p className="mt-1 text-muted-foreground leading-relaxed">{insight.body}</p>
      <p className="mt-2 text-xs text-primary">
        <span className="font-medium">Action:</span> {insight.action}
      </p>
    </div>
  );
}

export function SeasonalInsightsPanel({
  seasonal,
  categoryTrends = [],
  insights,
  title = "Seasonal tendencies",
  subtitle = "Patterns from your sales history — use for staffing, stock timing, and purchase planning.",
}: Props) {
  const displayInsights = insights ?? seasonal.insights;

  return (
    <div className="space-y-4">
      <Card className="glass-card border-info/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CloudSun className="size-5 text-info" />
            {title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
          {seasonal.hasEnoughData ? (
            <p className="text-xs text-muted-foreground">
              Based on {seasonal.lookbackDays} days · daily norm{" "}
              <span className="font-money">{formatTzs(seasonal.overallAvgDaily)}</span>
            </p>
          ) : (
            <p className="text-xs text-warning">
              Record at least 14 days of sales for reliable seasonal signals.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Weekly rhythm
              </p>
              <WeekdayPatternChart data={seasonal.weekdayPattern} />
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {seasonal.strongestWeekday ? (
                  <span className="flex items-center gap-1">
                    <TendencyBadge tendency="peak" />
                    {seasonal.strongestWeekday.label}
                  </span>
                ) : null}
                {seasonal.quietestWeekday &&
                seasonal.quietestWeekday.label !==
                  seasonal.strongestWeekday?.label ? (
                  <span className="flex items-center gap-1">
                    <TendencyBadge tendency="quiet" />
                    {seasonal.quietestWeekday.label}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarRange className="size-3.5" />
                  Month rhythm
                </p>
                <div className="space-y-2">
                  {seasonal.monthPartPattern
                    .filter((p) => p.dayCount > 0)
                    .map((p) => (
                      <div
                        key={p.key}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-surface-1/30 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <TendencyBadge tendency={p.tendency} />
                          <span>{p.label}</span>
                        </div>
                        <span className="font-money text-xs tabular-nums">
                          {formatTzs(p.avgSales)}/day
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {seasonal.calendarMonthPattern.filter((p) => p.dayCount >= 3)
                .length >= 2 ? (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Calendar months
                  </p>
                  <div className="space-y-2">
                    {seasonal.strongestMonth ? (
                      <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <TendencyBadge tendency="peak" />
                          Busiest: {seasonal.strongestMonth.label}
                        </span>
                        <span className="font-money text-xs">
                          {formatTzs(seasonal.strongestMonth.avgSales)}/day
                        </span>
                      </div>
                    ) : null}
                    {seasonal.quietestMonth &&
                    seasonal.quietestMonth.key !==
                      seasonal.strongestMonth?.key ? (
                      <div className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-1/30 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <TendencyBadge tendency="quiet" />
                          Quietest: {seasonal.quietestMonth.label}
                        </span>
                        <span className="font-money text-xs">
                          {formatTzs(seasonal.quietestMonth.avgSales)}/day
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {categoryTrends.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Category seasonality (12 months)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {categoryTrends.map((t) => (
                  <div
                    key={t.categoryName}
                    className="rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{t.categoryName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Peak {t.peakMonth} · Quiet {t.quietMonth}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {displayInsights.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Info className="size-3.5" />
                Guided actions
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {displayInsights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
