"use client";

import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InventoryDecisionInsight } from "@/lib/inventory/inventory-decision-insights";
import { cn } from "@/lib/utils";

type Props = {
  insights: InventoryDecisionInsight[];
  title?: string;
  subtitle?: string;
};

function InsightRow({ insight }: { insight: InventoryDecisionInsight }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm",
        insight.severity === "positive" && "border-inflow/30 bg-inflow/5",
        insight.severity === "warning" && "border-warning/40 bg-warning/10",
        insight.severity === "info" && "border-border/60 bg-surface-1/40"
      )}
    >
      <div className="flex items-start gap-2">
        {insight.severity === "positive" ? (
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-inflow" />
        ) : insight.severity === "warning" ? (
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-warning" />
        ) : (
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-info" />
        )}
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{insight.title}</p>
          <p className="mt-1 text-muted-foreground leading-relaxed">
            {insight.body}
          </p>
          <p className="mt-2 text-xs text-primary">
            <span className="font-medium">Next step:</span> {insight.action}
          </p>
        </div>
      </div>
    </div>
  );
}

export function InventoryInsightsPanel({
  insights,
  title = "Inventory decision summary",
  subtitle = "Auto-updated from sales, stock on hand, margins, and turnover — use when planning purchases.",
}: Props) {
  if (insights.length === 0) return null;

  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="size-5 text-primary" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {insights.map((insight) => (
          <InsightRow key={insight.id} insight={insight} />
        ))}
      </CardContent>
    </Card>
  );
}
