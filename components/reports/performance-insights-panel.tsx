"use client";

import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Minus,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OperationalReports } from "@/lib/actions/reports";
import type { ProfitLossStatement } from "@/lib/actions/reports";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  operational?: OperationalReports;
  pl?: ProfitLossStatement;
};

function ChangeBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" />
        No prior period
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        up ? "bg-inflow/15 text-inflow" : "bg-outflow/15 text-outflow"
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3" />
      ) : (
        <ArrowDownRight className="size-3" />
      )}
      {up ? "+" : ""}
      {pct}% vs prior period
    </span>
  );
}

export function PerformanceInsightsPanel({ operational, pl }: Props) {
  if (!operational) return null;

  const perf = operational.performance;
  const netProfit = pl?.netProfit ?? operational.netCash;
  const guidance = perf.capitalGuidance;

  return (
    <div className="space-y-4">
      <Card className="glass-card border-primary/20">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-5 text-primary" />
            Performance insights
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Use these signals for rent, salaries, purchases, and stock — based on{" "}
            {operational.period.label}.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-surface-1/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sales trend
            </p>
            <p className="mt-1 font-money text-xl font-bold tabular-nums">
              {formatTzs(operational.salesTotal)}
            </p>
            <div className="mt-2">
              <ChangeBadge pct={perf.salesChangePct} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Avg {formatTzs(perf.avgDailySales)}/day · {perf.daysWithSales} active
              day{perf.daysWithSales === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-1/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Net profit (P&amp;L)
            </p>
            <p
              className={cn(
                "mt-1 font-money text-xl font-bold tabular-nums",
                netProfit >= 0 ? "text-inflow" : "text-outflow"
              )}
            >
              {formatTzs(netProfit)}
            </p>
            <div className="mt-2">
              <ChangeBadge pct={perf.netProfitChangePct} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              After COGS &amp; operating expenses in period
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-1/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Best / quiet day
            </p>
            {perf.peakDay ? (
              <p className="mt-1 text-sm">
                <span className="font-semibold text-inflow">Peak </span>
                {format(parseISO(perf.peakDay.date), "d MMM")} ·{" "}
                <span className="font-money">{formatTzs(perf.peakDay.total)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No sales yet</p>
            )}
            {perf.quietDay && perf.quietDay.total > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Quietest with sales: {format(parseISO(perf.quietDay.date), "d MMM")}{" "}
                · {formatTzs(perf.quietDay.total)}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-border/60 bg-surface-1/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Stock &amp; credit
            </p>
            <p className="mt-1 text-sm">
              <span className="text-warning">{operational.lowStockCount}</span> low-stock
              SKU{operational.lowStockCount === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Customer credit due:{" "}
              <span className="font-money text-warning">
                {formatTzs(operational.creditOutstanding)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          "glass-card",
          guidance.severity === "warning"
            ? "border-warning/40"
            : guidance.severity === "positive"
              ? "border-inflow/30"
              : "border-border"
        )}
      >
        <CardContent className="flex gap-3 py-4">
          {guidance.severity === "warning" ? (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          ) : (
            <Wallet className="mt-0.5 size-5 shrink-0 text-primary" />
          )}
          <div>
            <p className="font-semibold">{guidance.title}</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {guidance.body}
            </p>
            {guidance.bullets.length > 0 ? (
              <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                {guidance.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
