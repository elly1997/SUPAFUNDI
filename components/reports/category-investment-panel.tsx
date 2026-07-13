"use client";

import Link from "next/link";
import type { CategoryInvestmentRow } from "@/lib/inventory/category-investment";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

const actionClass: Record<CategoryInvestmentRow["action"], string> = {
  invest: "bg-inflow/15 text-inflow",
  maintain: "bg-muted text-muted-foreground",
  reduce: "bg-warning/15 text-warning",
};

type Props = {
  rows: CategoryInvestmentRow[];
  compact?: boolean;
};

export function CategoryInvestmentPanel({ rows, compact }: Props) {
  const top = compact ? rows.slice(0, 5) : rows.slice(0, 12);

  if (top.length === 0) {
    return (
      <Card className="glass-card">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No category sales yet — investments scoreboard fills after POS sales.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">Where to invest next</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Strong selling categories vs stock capital — use suggested PO budget
            % when buying.
          </p>
        </div>
        {compact ? (
          <Link
            href="/reports?tab=inventory"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            Full report
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Sales %</TableHead>
              <TableHead className="text-right">Capital %</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              {!compact ? (
                <TableHead className="text-right">PO budget</TableHead>
              ) : null}
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {top.map((row) => (
              <TableRow key={row.categoryName}>
                <TableCell className="font-medium">{row.categoryName}</TableCell>
                <TableCell className="text-right font-money text-sm">
                  {row.salesSharePct}%
                </TableCell>
                <TableCell className="text-right font-money text-sm">
                  {row.capitalSharePct}%
                </TableCell>
                <TableCell className="text-right font-money text-sm">
                  {row.marginPct.toFixed(0)}%
                  {!compact ? (
                    <span className="block text-[11px] text-muted-foreground">
                      {formatTzs(row.margin)}
                    </span>
                  ) : null}
                </TableCell>
                {!compact ? (
                  <TableCell className="text-right font-money text-sm font-semibold text-primary">
                    {row.suggestedBudgetPct > 0
                      ? `${row.suggestedBudgetPct}%`
                      : "—"}
                  </TableCell>
                ) : null}
                <TableCell>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      actionClass[row.action]
                    )}
                  >
                    {row.action}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
