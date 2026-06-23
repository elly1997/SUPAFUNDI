"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchDayCashSummary } from "@/lib/api/daily-ops-fetch";
import type { UnreconciledDayRow } from "@/lib/actions/daily-closing";
import { listCashSessionHistory } from "@/lib/actions/cash-sessions";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  unreconciled: UnreconciledDayRow[];
};

export function ReportsDailyClosingPanel({ unreconciled }: Props) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["day-cash-summary", outletId, businessDate],
    queryFn: () => fetchDayCashSummary(outletId!, businessDate),
    enabled: !!outletId,
    staleTime: 90_000,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["cash-sessions-history", outletId],
    queryFn: () => listCashSessionHistory(outletId),
    enabled: !!outletId,
    staleTime: 90_000,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Opening cash"
          value={
            summaryLoading
              ? "…"
              : formatTzs(summary?.openingBalance ?? 0)
          }
          subtitle={`Business date ${businessDate}`}
          icon={Wallet}
          className="glass-card"
        />
        <KpiCard
          title="Expected closing"
          value={
            summaryLoading
              ? "…"
              : formatTzs(summary?.expectedCash ?? 0)
          }
          subtitle="Drawer + cash movements"
          icon={Scale}
          variant="inflow"
          className="glass-card"
        />
        <KpiCard
          title="Sales (business date)"
          value={
            summaryLoading
              ? "…"
              : formatTzs(summary?.totalSales ?? 0)
          }
          subtitle={
            summaryLoading
              ? "Loading…"
              : `${summary?.salesCount ?? 0} sale(s) · Cash ${formatTzs(summary?.cashSales ?? 0)} · M-Pesa ${formatTzs(summary?.mpesaSales ?? 0)}`
          }
          icon={TrendingUp}
          variant="inflow"
          className="glass-card"
        />
        <KpiCard
          title="Net (sales − expenses)"
          value={
            summaryLoading
              ? "…"
              : formatTzs(summary?.netToday ?? 0)
          }
          subtitle={`Expenses ${summaryLoading ? "…" : formatTzs(summary?.expensesToday ?? 0)}`}
          icon={Receipt}
          variant={(summary?.netToday ?? 0) >= 0 ? "inflow" : "outflow"}
          className="glass-card"
        />
      </div>

      {outletId ? (
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Cash drawer today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Open the drawer with your float before POS sales, or reconcile the
              day when done.
            </p>
            <CashSessionBar
              outletId={outletId}
              variant="inline"
              redirectAfterOpen="/pos"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="glass-card border-primary/30">
        <CardContent className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:text-left">
          <Scale className="size-10 shrink-0 text-primary" />
          <div className="flex-1 space-y-1">
            <p className="text-lg font-semibold">Daily closing &amp; reconciliation</p>
            <p className="text-sm text-muted-foreground">
              Count physical cash, compare to expected closing, and mark{" "}
              <strong className="text-foreground">{businessDate}</strong>{" "}
              reconciled. Reconciled days filter other report tabs.
            </p>
          </div>
          <Link
            href="/daily-closing"
            className={cn(buttonVariants(), "shrink-0 rounded-xl")}
          >
            Open daily closing
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drawer sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {!outletId ? (
            <p className="text-sm text-muted-foreground">
              Select an outlet in the header to view sessions.
            </p>
          ) : sessionsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No drawer sessions yet. Open the drawer above or from POS.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Closed</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.slice(0, 20).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">
                        {s.business_date}
                      </TableCell>
                      <TableCell className="capitalize text-xs">
                        {s.status}
                      </TableCell>
                      <TableCell className="text-right font-money">
                        {formatTzs(s.opening_balance)}
                      </TableCell>
                      <TableCell className="text-right font-money">
                        {s.expected_balance != null
                          ? formatTzs(s.expected_balance)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-money">
                        {s.closing_balance != null
                          ? formatTzs(s.closing_balance)
                          : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-money",
                          s.variance != null &&
                            s.variance !== 0 &&
                            "text-warning"
                        )}
                      >
                        {s.variance != null ? formatTzs(s.variance) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Unreconciled days</CardTitle>
        </CardHeader>
        <CardContent>
          {unreconciled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unreconciled days with activity in this outlet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {unreconciled.map((d) => (
                <li
                  key={`${d.outletId}-${d.businessDate}`}
                  className="flex justify-between rounded-lg border px-3 py-2"
                >
                  <span>
                    {d.businessDate} · {d.outletName}
                  </span>
                  <span className="font-money text-warning">
                    {formatTzs(d.expectedCash)} expected
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
