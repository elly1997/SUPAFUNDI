"use client";

import { AlertTriangle, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CostRetailMarginAnalysis } from "@/lib/inventory/cost-retail-insights";
import { cn } from "@/lib/utils";

type Props = {
  analysis: CostRetailMarginAnalysis;
};

function InsightCard({
  insight,
}: {
  insight: CostRetailMarginAnalysis["insights"][0];
}) {
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
      <p className="mt-1 leading-relaxed text-muted-foreground">{insight.body}</p>
      <p className="mt-2 text-xs text-primary">
        <span className="font-medium">Action:</span> {insight.action}
      </p>
    </div>
  );
}

export function CostRetailInsightsPanel({ analysis }: Props) {
  const marginDown = analysis.marginPctChange < 0;
  const MarginIcon = marginDown ? TrendingDown : TrendingUp;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="size-5 text-primary" />
          Cost vs retail — margin on stock
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Compare how buying costs and selling prices moved on the inventory you
          hold. Widen the gap by updating retail when suppliers raise invoices.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Margin at period start</p>
            <p className="mt-1 font-money text-lg font-semibold tabular-nums">
              {analysis.openingMarginPct}%
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Margin now (on hand)</p>
            <p className="mt-1 font-money text-lg font-semibold tabular-nums">
              {analysis.closingMarginPct}%
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5",
              marginDown
                ? "border-warning/40 bg-warning/10"
                : "border-inflow/30 bg-inflow/5"
            )}
          >
            <p className="text-xs text-muted-foreground">Margin change</p>
            <p
              className={cn(
                "mt-1 flex items-center gap-1 font-money text-lg font-semibold tabular-nums",
                marginDown ? "text-warning" : "text-inflow"
              )}
            >
              <MarginIcon className="size-4 shrink-0" />
              {analysis.marginPctChange >= 0 ? "+" : ""}
              {analysis.marginPctChange} pts
            </p>
          </div>
          <div
            className={cn(
              "rounded-lg border px-3 py-2.5",
              analysis.costOutpacingRetail
                ? "border-warning/40 bg-warning/10"
                : "border-border/60 bg-surface-1/40"
            )}
          >
            <p className="text-xs text-muted-foreground">Cost vs retail pace</p>
            <p className="mt-1 text-sm font-medium leading-snug">
              {analysis.costOutpacingRetail ? (
                <span className="flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  Cost +{analysis.costValueChangePct}% vs retail +
                  {analysis.retailValueChangePct}%
                </span>
              ) : (
                <>
                  Cost {analysis.costValueChangePct >= 0 ? "+" : ""}
                  {analysis.costValueChangePct}% · Retail{" "}
                  {analysis.retailValueChangePct >= 0 ? "+" : ""}
                  {analysis.retailValueChangePct}%
                </>
              )}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {analysis.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
