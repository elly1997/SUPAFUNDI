"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subMonths } from "date-fns";
import {
  BarChart3,
  Boxes,
  Download,
  Loader2,
  Package,
  Printer,
  RefreshCw,
  Scale,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { FinancialReports } from "@/components/reports/financial-reports";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import {
  getOperationalReportsByRange,
  getProfitLossStatement,
  type OperationalReports,
  type ProfitLossStatement,
} from "@/lib/actions/reports";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

const REPORT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "sales", label: "Sales Analysis" },
  { id: "inventory", label: "Inventory Report" },
  { id: "daily", label: "Daily Summary" },
  { id: "cashflow", label: "Cash Flow" },
  { id: "expenditures", label: "Expenditures" },
  { id: "daily-closing", label: "Daily Closing" },
  { id: "monthly-closing", label: "Monthly Closing" },
] as const;

type ReportTabId = (typeof REPORT_TABS)[number]["id"];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  bank_transfer: "Bank",
  credit_account: "On account",
  cheque: "Cheque",
};

function defaultFromDate() {
  return format(subMonths(new Date(), 3), "yyyy-MM-dd");
}

function defaultToDate() {
  return format(new Date(), "yyyy-MM-dd");
}

function formatDeduction(amount: number) {
  if (amount === 0) return formatTzs(0);
  return `(${formatTzs(amount)})`;
}

function PlRow({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "deduction" | "highlight" | "profit" | "footer";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-5 py-3.5 text-sm",
        variant === "highlight" && "bg-muted/50 font-semibold",
        variant === "profit" && "font-semibold text-inflow",
        variant === "footer" &&
          "rounded-b-xl bg-primary px-5 py-4 text-base font-bold text-primary-foreground"
      )}
    >
      <span
        className={cn(
          variant === "deduction" && "text-outflow",
          variant === "footer" && "text-primary-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-money tabular-nums",
          variant === "deduction" && "text-outflow",
          variant === "default" && "font-medium",
          variant === "highlight" && "font-bold",
          variant === "profit" && "text-inflow",
          variant === "footer" && "text-primary-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ProfitLossPanel({
  data,
  isLoading,
}: {
  data?: ProfitLossStatement;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <Card className="overflow-hidden border-border bg-card shadow-card">
      <CardHeader className="border-b border-border bg-muted/30 py-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="size-5 text-primary" />
          Profit &amp; Loss Statement
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <PlRow label="Gross Sales" value={formatTzs(data.grossSales)} />
        <PlRow
          label="Less: Discounts"
          value={formatDeduction(data.discounts)}
          variant="deduction"
        />
        <PlRow
          label="Net Sales"
          value={formatTzs(data.netSales)}
          variant="highlight"
        />
        <PlRow
          label="Less: Cost of Goods Sold"
          value={formatDeduction(data.costOfGoodsSold)}
          variant="deduction"
        />
        <PlRow
          label="Gross Profit"
          value={formatTzs(data.grossProfit)}
          variant="profit"
        />
        <PlRow
          label="Less: Operating Expenses"
          value={formatDeduction(data.operatingExpenses)}
          variant="deduction"
        />
        <PlRow
          label="Net Profit"
          value={formatTzs(data.netProfit)}
          variant="footer"
        />
      </CardContent>
    </Card>
  );
}

type Props = {
  initialOperational?: OperationalReports;
  initialPl?: ProfitLossStatement;
  initialFrom?: string;
  initialTo?: string;
};

export function ReportsAnalyticsClient({
  initialOperational,
  initialPl,
  initialFrom,
  initialTo,
}: Props) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [tab, setTab] = useState<ReportTabId>("profit-loss");
  const [fromDate, setFromDate] = useState(initialFrom ?? defaultFromDate());
  const [toDate, setToDate] = useState(initialTo ?? defaultToDate());
  const [showGlDetail, setShowGlDetail] = useState(false);

  const rangeKey = [fromDate, toDate, outletId];

  const {
    data: operational,
    isLoading: opLoading,
    isFetching: opFetching,
    refetch: refetchOp,
  } = useQuery({
    queryKey: ["reports-operational", ...rangeKey],
    queryFn: () => getOperationalReportsByRange(fromDate, toDate, outletId),
    initialData:
      initialOperational &&
      initialFrom === fromDate &&
      initialTo === toDate
        ? initialOperational
        : undefined,
    staleTime: 60_000,
  });

  const {
    data: pl,
    isLoading: plLoading,
    refetch: refetchPl,
  } = useQuery({
    queryKey: ["reports-pl", ...rangeKey],
    queryFn: () => getProfitLossStatement(fromDate, toDate, outletId),
    initialData:
      initialPl && initialFrom === fromDate && initialTo === toDate
        ? initialPl
        : undefined,
    staleTime: 60_000,
  });

  const generateReports = useCallback(() => {
    void refetchOp();
    void refetchPl();
    toast.success("Reports updated");
  }, [refetchOp, refetchPl]);

  const chartMax = useMemo(
    () => Math.max(...(operational?.salesByDay.map((d) => d.total) ?? [0]), 1),
    [operational?.salesByDay]
  );

  const renderOverview = () => {
    if (opLoading && !operational) {
      return (
        <div className="flex justify-center py-16">
          <Loader2 className="size-10 animate-spin text-primary" />
        </div>
      );
    }
    if (!operational) return null;
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Sales"
            value={formatTzs(operational.salesTotal)}
            subtitle={`${operational.salesCount} transactions`}
            icon={TrendingUp}
            variant="inflow"
            className="glass-card"
          />
          <KpiCard
            title="Expenses"
            value={formatTzs(operational.expensesTotal)}
            subtitle={`${operational.expensesCount} recorded`}
            variant="outflow"
            className="glass-card"
          />
          <KpiCard
            title="Net cash"
            value={formatTzs(operational.netCash)}
            subtitle="Sales minus expenses"
            variant={operational.netCash >= 0 ? "inflow" : "outflow"}
            className="glass-card"
          />
          <KpiCard
            title="Avg. ticket"
            value={formatTzs(operational.avgTicket)}
            className="glass-card"
          />
        </div>
        <ProfitLossPanel data={pl} isLoading={plLoading} />
      </div>
    );
  };

  const renderSalesAnalysis = () => {
    if (!operational) return null;
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Daily sales</CardTitle>
          </CardHeader>
          <CardContent>
            {operational.salesByDay.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sales in this period
              </p>
            ) : (
              <div className="flex h-44 items-end gap-2">
                {operational.salesByDay.map((d) => (
                  <div
                    key={d.date}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-primary/80 to-primary"
                      style={{
                        height: `${Math.max(8, (d.total / chartMax) * 100)}%`,
                      }}
                      title={formatTzs(d.total)}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {format(parseISO(d.date), "d MMM")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Top products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {operational.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              operational.topProducts.map((p, i) => (
                <div
                  key={p.name}
                  className="flex justify-between rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm"
                >
                  <span>
                    {i + 1}. {p.name}
                  </span>
                  <span className="font-money font-semibold">
                    {formatTzs(p.revenue)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTabBody = () => {
    switch (tab) {
      case "overview":
        return renderOverview();
      case "profit-loss":
        return <ProfitLossPanel data={pl} isLoading={plLoading} />;
      case "sales":
        return renderSalesAnalysis();
      case "inventory":
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-5 text-warning" />
                Inventory alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-warning">
                {operational?.lowStockCount ?? 0}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                SKU(s) at or below reorder level (≤5 units)
              </p>
              <Link
                href="/inventory/stock"
                className={cn(buttonVariants(), "mt-4 rounded-xl")}
              >
                View stock
              </Link>
            </CardContent>
          </Card>
        );
      case "daily":
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Daily summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-2xl font-bold">{operational?.salesCount ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gross sales</p>
                <p className="font-money text-2xl font-bold">
                  {formatTzs(operational?.salesTotal ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net cash</p>
                <p className="font-money text-2xl font-bold text-inflow">
                  {formatTzs(operational?.netCash ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      case "cashflow":
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Payment mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(operational?.paymentMix ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments</p>
              ) : (
                operational?.paymentMix.map((p) => (
                  <div key={p.method} className="flex justify-between text-sm">
                    <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                    <span className="font-money font-semibold">
                      {formatTzs(p.total)} ({p.count})
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        );
      case "expenditures":
        return (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Expenditures</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-money text-3xl font-bold text-outflow">
                {formatTzs(operational?.expensesTotal ?? 0)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {operational?.expensesCount ?? 0} expense entries in period
              </p>
              <Link
                href="/finance/expenses"
                className={cn(buttonVariants({ variant: "outline" }), "mt-4 rounded-xl")}
              >
                Manage expenses
              </Link>
            </CardContent>
          </Card>
        );
      case "daily-closing":
        return (
          <Card className="glass-card border-primary/30">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <Scale className="size-10 text-primary" />
              <p className="text-lg font-semibold">Daily closing</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Reconcile drawer, sales, and expenses for the business date.
              </p>
              <Link href="/daily-closing" className={cn(buttonVariants(), "rounded-xl")}>
                Open daily closing
              </Link>
            </CardContent>
          </Card>
        );
      case "monthly-closing":
        return (
          <Card className="glass-card">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Monthly closing workflow — use P&amp;L and trial balance below for period-end
              review.
              <button
                type="button"
                className="mt-4 block w-full text-primary hover:underline"
                onClick={() => setShowGlDetail(true)}
              >
                Show GL detail
              </button>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="app-page space-y-5 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <BarChart3 className="size-7 text-primary" />
            Reports &amp; Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {operational?.period.label ?? "Select dates and generate reports"}
            {opFetching ? " · Updating…" : null}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[10.5rem] rounded-lg"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[10.5rem] rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-lg btn-primary-gradient"
          onClick={generateReports}
        >
          <RefreshCw className="mr-2 size-4" />
          Generate Reports
        </Button>
        <Button
          type="button"
          variant="default"
          className="rounded-lg"
          onClick={() => toast.message("Inventory rectification runs from stock receive & adjustments")}
        >
          <Boxes className="mr-2 size-4" />
          Rectify all Inventory
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg"
          onClick={() => window.print()}
        >
          <Printer className="mr-2 size-4" />
          Print
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg"
          onClick={() => toast.message("Export CSV — coming soon")}
        >
          <Download className="mr-2 size-4" />
          Export
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg"
          onClick={() => toast.message("Reconcile from Sales and Payments modules")}
        >
          Reconcile sales
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="rounded-lg"
          onClick={() => toast.message("Reconcile from Purchase orders & GRN")}
        >
          Reconcile purchases
        </Button>
      </div>

      <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-1">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "report-tab shrink-0 whitespace-nowrap",
              tab === t.id && "report-tab-active"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {renderTabBody()}

      {(showGlDetail || tab === "monthly-closing") && (
        <div className="border-t border-border pt-6">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
            General ledger detail
          </h2>
          <FinancialReports fromDate={fromDate} toDate={toDate} />
        </div>
      )}
    </div>
  );
}
