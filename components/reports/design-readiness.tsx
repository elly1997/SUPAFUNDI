"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getDesignReadinessChecks,
  getDesignReadinessSummary,
} from "@/lib/design/readiness";
import { cn } from "@/lib/utils";

export function DesignReadiness() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const summary = mounted
    ? getDesignReadinessSummary()
    : { passed: 0, total: 3, ready: false, brand: "SUPAFUNDI TRADERS", checks: [] };
  const checks = mounted ? getDesignReadinessChecks() : [];

  return (
    <Card className="dash-stat-card border-primary/20">
      <CardHeader>
        <CardTitle>Design system readiness</CardTitle>
        <CardDescription>
          {summary.brand} — dark theme, orange brand, horizontal navigation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span
            className={cn(
              "font-semibold",
              summary.ready ? "text-inflow" : "text-warning"
            )}
          >
            {summary.passed}/{summary.total}
          </span>{" "}
          checks passed in this browser
        </p>
        <ul className="space-y-2">
          {checks.map((check) => {
            const Icon = check.ok ? CheckCircle2 : Circle;
            return (
              <li
                key={check.id}
                className="flex items-start gap-2 text-sm"
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    check.ok ? "text-inflow" : "text-muted-foreground"
                  )}
                />
                <span>
                  <span className="font-medium">{check.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {check.detail}
                  </span>
                </span>
              </li>
            );
          })}
          {!mounted ? (
            <li className="text-sm text-muted-foreground">
              Run in browser to verify CSS tokens…
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
