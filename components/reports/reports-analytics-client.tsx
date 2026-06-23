"use client";

import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import {
  BarChart3,
  Boxes,
  Download,
  Loader2,
  Printer,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { FinancialReports } from "@/components/reports/financial-reports";
import { InventoryReportPanel } from "@/components/reports/inventory-report-panel";
import { PerformanceInsightsPanel } from "@/components/reports/performance-insights-panel";
import { ReportsDailyClosingPanel } from "@/components/reports/reports-daily-closing-panel";
import { SeasonalInsightsPanel } from "@/components/reports/seasonal-insights-panel";
import {
  DailySalesChart,
  SalesExpenseTrendChart,
} from "@/components/reports/report-charts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  getOperationalExportCsv,
  getOperationalReportsByRange,
  getProfitLossStatement,
  type ProfitLossStatement,
} from "@/lib/actions/reports";
import { listUnreconciledDays } from "@/lib/actions/daily-closing";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

const REPORT_TABS = [
  { id: "overview", label: "Overview" },
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "sales", label: "Sales Analysis" },
  { id: "inventory", label: "Inventory" },
  { id: "cash", label: "Cash & Payments" },
  { id: "financials", label: "Financials (GL)" },
  { id: "closing", label: "Daily Closing" },
] as const;

const NEEDS_OPERATIONAL = new Set<ReportTabId>([
  "overview",
  "sales",
  "cash",
]);
const NEEDS_PL = new Set<ReportTabId>(["overview", "profit-loss"]);

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
  return format(subMonths(new Date(), 1), "yyyy-MM-dd");
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

export function ReportsAnalyticsClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [tab, setTab] = useState<ReportTabId>("overview");
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [toDate, setToDate] = useState(defaultToDate());
  const [reconciledOnly, setReconciledOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  const rangeKey = [fromDate, toDate, outletId, reconciledOnly];
  const needsOperational = NEEDS_OPERATIONAL.has(tab);
  const needsPl = NEEDS_PL.has(tab);

  const {
    data: operational,
    isLoading: opLoading,
    isFetching: opFetching,
    refetch: refetchOp,
  } = useQuery({
    queryKey: ["reports-operational", ...rangeKey],
    queryFn: () =>
      getOperationalReportsByRange(fromDate, toDate, outletId, reconciledOnly),
    enabled: needsOperational,
    staleTime: 120_000,
  });

  const {
    data: pl,
    isLoading: plLoading,
    refetch: refetchPl,
  } = useQuery({
    queryKey: ["reports-pl", ...rangeKey],
    queryFn: () =>
      getProfitLossStatement(fromDate, toDate, outletId, reconciledOnly),
    enabled: needsPl,
    staleTime: 120_000,
  });

  const { data: unreconciled = [] } = useQuery({
    queryKey: ["reports-unreconciled", outletId],
    queryFn: () => listUnreconciledDays(outletId, 40),
    enabled: tab === "closing",
    staleTime: 120_000,
  });

  const generateReports = useCallback(() => {
    void refetchOp();
    void refetchPl();
    toast.success("Reports updated");
  }, [refetchOp, refetchPl]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const csv = await getOperationalExportCsv(
        fromDate,
        toDate,
        outletId,
        reconciledOnly
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reports-${fromDate}-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [fromDate, toDate, outletId, reconciledOnly]);

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
        <PerformanceInsightsPanel operational={operational} pl={pl ?? undefined} />
        <SeasonalInsightsPanel seasonal={operational.seasonal} />
        {operational.trendByDay.length > 0 ? (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Sales vs expenses</CardTitle>
              <p className="text-sm text-muted-foreground">
                Daily cash in vs shop expenses — use quiet stretches to protect
                capital for rent and payroll.
              </p>
            </CardHeader>
            <CardContent>
              <SalesExpenseTrendChart data={operational.trendByDay} />
            </CardContent>
          </Card>
        ) : null}
        <ProfitLossPanel data={pl} isLoading={plLoading} />
      </div>
    );
  };

  const renderSalesAnalysis = () => {
    if (!operational) return null;
    const hasSales = operational.salesByDay.some((d) => d.total > 0);
    return (
      <div className="space-y-4">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Daily sales trend</CardTitle>
            <p className="text-sm text-muted-foreground">
              Every day in the selected range — zero days included so peaks and
              slow periods are easy to compare.
            </p>
          </CardHeader>
          <CardContent>
            {!hasSales ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sales in this period.
                {reconciledOnly ? (
                  <>
                    {" "}
                    Try unchecking &ldquo;Reconciled days only&rdquo; or reconcile
                    days in Daily closing.
                  </>
                ) : null}
              </p>
            ) : (
              <DailySalesChart data={operational.salesByDay} height={300} />
            )}
          </CardContent>
        </Card>
        <SeasonalInsightsPanel
          seasonal={operational.seasonal}
          title="Sales seasonality"
          subtitle="Weekly and monthly rhythms in your selected range and 90-day lookback."
        />
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Sales vs expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesExpenseTrendChart data={operational.trendByDay} height={280} />
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base">Top products</CardTitle>
            <p className="text-xs text-muted-foreground">
              Ranked by how often sold (line count), then revenue. Quantities use
              the unit recorded at checkout.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {operational.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              operational.topProducts.map((p, i) => (
                <div
                  key={p.productId ?? p.name}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">
                      {i + 1}. {p.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.lineCount} sale{p.lineCount === 1 ? "" : "s"}
                      {p.quantity > 0
                        ? ` · ${p.quantity}${p.unitLabel ? ` ${p.unitLabel}` : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 font-money text-xs font-semibold tabular-nums">
                    {formatTzs(p.revenue)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </div>
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
        return <InventoryReportPanel enabled={tab === "inventory"} />;
      case "cash":
        if (opLoading && !operational) {
          return (
            <div className="flex justify-center py-16">
              <Loader2 className="size-10 animate-spin text-primary" />
            </div>
          );
        }
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Period summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="text-2xl font-bold">
                    {operational?.salesCount ?? 0}
                  </p>
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
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Payment mix</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(operational?.paymentMix ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments</p>
                ) : (
                  operational?.paymentMix.map((p) => (
                    <div
                      key={p.method}
                      className="flex justify-between text-sm"
                    >
                      <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                      <span className="font-money font-semibold">
                        {formatTzs(p.total)} ({p.count})
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Expenditures</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-money text-3xl font-bold text-outflow">
                    {formatTzs(operational?.expensesTotal ?? 0)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {operational?.expensesCount ?? 0} entries in period
                  </p>
                </div>
                <Link
                  href="/finance/expenses"
                  className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}
                >
                  Manage expenses
                </Link>
              </CardContent>
            </Card>
          </div>
        );
      case "financials":
        return <FinancialReports fromDate={fromDate} toDate={toDate} />;
      case "closing":
        return <ReportsDailyClosingPanel unreconciled={unreconciled} />;
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
          <DateRangePicker
            label="Report period"
            from={fromDate}
            to={toDate}
            onFromChange={setFromDate}
            onToChange={setToDate}
            align="end"
          />
          <label className="flex max-w-[11rem] flex-col gap-1 self-end pb-2 text-xs">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={reconciledOnly}
                onChange={(e) => setReconciledOnly(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Reconciled days only
            </span>
            <span className="text-[10px] leading-snug text-muted-foreground">
              When checked, only days marked reconciled in Daily closing appear.
            </span>
          </label>
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
        <Link
          href="/inventory/stock"
          className={cn(buttonVariants({ variant: "outline" }), "rounded-lg")}
        >
          <Boxes className="mr-2 size-4" />
          Stock & adjustments
        </Link>
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
          disabled={exporting}
          onClick={() => void exportCsv()}
        >
          <Download className="mr-2 size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
        <Link
          href="/daily-closing"
          className={cn(buttonVariants({ variant: "secondary" }), "rounded-lg")}
        >
          Daily closing
        </Link>
        <Link
          href="/suppliers?tab=bills"
          className={cn(buttonVariants({ variant: "secondary" }), "rounded-lg")}
        >
          Supplier payables
        </Link>
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
    </div>
  );
}
