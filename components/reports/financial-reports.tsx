"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  backfillMissingGlJournals,
  getGlPostingGaps,
} from "@/lib/actions/gl-backfill";
import { getFinancialReports } from "@/lib/actions/reports";
import { formatTzs } from "@/lib/utils/currency";

type FinancialReportsProps = {
  fromDate?: string;
  toDate?: string;
};

export function FinancialReports({ fromDate, toDate }: FinancialReportsProps) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["financial-reports", fromDate, toDate],
    queryFn: () => getFinancialReports(fromDate, toDate),
  });

  const {
    data: gaps,
    isLoading: gapsLoading,
  } = useQuery({
    queryKey: ["gl-posting-gaps", fromDate, toDate],
    queryFn: () => getGlPostingGaps(fromDate, toDate),
  });

  const backfill = useMutation({
    mutationFn: () => backfillMissingGlJournals(fromDate, toDate, 200),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const posted =
        result.salesPosted +
        result.expensesPosted +
        result.grnsPosted +
        result.customerPaymentsPosted +
        result.customerDepositsPosted +
        result.supplierPaymentsPosted;
      if (posted === 0 && result.errors.length === 0) {
        toast.success("Books are already in sync for this period.");
      } else {
        toast.success(
          `Posted ${posted} journal(s): ${result.salesPosted} sales, ${result.expensesPosted} expenses, ${result.grnsPosted} GRNs, ${result.customerPaymentsPosted} customer payments, ${result.customerDepositsPosted} deposits, ${result.supplierPaymentsPosted} supplier payments.`
        );
      }
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} item(s) could not be posted. First: ${result.errors[0]}`
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["financial-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["gl-posting-gaps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load reports"}
      </p>
    );
  }
  if (!data) return null;

  const { trialBalance, balanceSheet: bs, profitAndLoss: pl } = data;
  const inv = bs.inventoryReconciliation;
  const missingTotal =
    (gaps?.salesMissingJournal ?? 0) +
    (gaps?.expensesMissingJournal ?? 0) +
    (gaps?.grnsMissingJournal ?? 0) +
    (gaps?.customerPaymentsMissingJournal ?? 0) +
    (gaps?.customerDepositsMissingJournal ?? 0) +
    (gaps?.supplierPaymentsMissingJournal ?? 0);

  return (
    <div className="space-y-6">
      <Card className="glass-card border-primary/30">
        <CardHeader>
          <CardTitle>Sync books to GL</CardTitle>
          <p className="text-sm text-muted-foreground">
            Posts missing journals for sales, expenses, GRNs, customer
            payments/deposits, and supplier payments so books match POS
            activity. Use the date range above. Owners/managers only.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {gapsLoading || !gaps ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking posting gaps…
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">Sales missing journal</p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.salesMissingJournal} / {gaps.completedSales}
                  </p>
                  {gaps.salesMissingJournal > 0 ? (
                    <p className="text-xs text-warning">
                      ~{formatTzs(gaps.missingSalesNetApprox)} net sales not in
                      GL
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">
                    Expenses missing journal
                  </p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.expensesMissingJournal} / {gaps.expenses}
                  </p>
                  {gaps.expensesMissingJournal > 0 ? (
                    <p className="text-xs text-warning">
                      {formatTzs(gaps.missingExpensesTotal)} not in GL
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">GRNs missing journal</p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.grnsMissingJournal} / {gaps.grns}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">
                    Customer AR payments missing
                  </p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.customerPaymentsMissingJournal} /{" "}
                    {gaps.customerPayments}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">
                    Customer deposits missing
                  </p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.customerDepositsMissingJournal} /{" "}
                    {gaps.customerDeposits}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-muted-foreground">
                    Supplier payments missing
                  </p>
                  <p className="font-money text-base font-semibold tabular-nums">
                    {gaps.supplierPaymentsMissingJournal} /{" "}
                    {gaps.supplierPayments}
                  </p>
                </div>
              </div>
              {missingTotal === 0 ? (
                <p className="text-sm text-inflow">
                  All sales, expenses, GRNs, and party payments in this period
                  are posted.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Each run posts up to 200 missing rows. Run again if a gap
                  remains.
                </p>
              )}
              <Button
                type="button"
                className="h-11"
                disabled={backfill.isPending || missingTotal === 0}
                onClick={() => backfill.mutate()}
              >
                {backfill.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Posting to GL…
                  </>
                ) : (
                  "Post missing journals"
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Profit &amp; loss (posted books)</CardTitle>
          <p className="text-sm text-muted-foreground">
            {pl.periodFrom && pl.periodTo
              ? `Posted journal activity from ${pl.periodFrom} to ${pl.periodTo}. For store performance, use the Profit & Loss tab.`
              : "Posted journal activity in the selected period. For store performance, use the Profit & Loss tab."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span>Total income</span>
            <span className="font-medium">{formatTzs(pl.totalIncome)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span>Cost of goods sold</span>
            <span>{formatTzs(pl.totalCogs)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span>Operating expenses</span>
            <span>{formatTzs(pl.totalExpenses)}</span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t pt-2 text-base font-semibold">
            <span>Net income</span>
            <span
              className={
                pl.netIncome >= 0 ? "text-inflow" : "text-destructive"
              }
            >
              {formatTzs(pl.netIncome)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Balance sheet</CardTitle>
          <p className="text-sm text-muted-foreground">
            As of {bs.asOfDate} (includes cumulative posted net income)
          </p>
        </CardHeader>
        <CardContent className="grid gap-6 text-sm md:grid-cols-2">
          <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 font-medium text-foreground">
              Inventory reconciliation
            </p>
            <div className="space-y-1 text-muted-foreground">
              <div className="flex flex-wrap justify-between gap-2">
                <span>GL inventory (1200)</span>
                <span className="font-money">{formatTzs(inv.glBalance)}</span>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <span>Stock on hand (qty × cost)</span>
                <span className="font-money">
                  {formatTzs(inv.stockLedgerAtCost)}
                </span>
              </div>
              {inv.variance !== 0 ? (
                <p className="pt-1 text-xs text-amber-400">
                  Variance {formatTzs(inv.variance)} — receive goods through GRN
                  or adjust stock so the GL matches physical inventory.
                </p>
              ) : (
                <p className="pt-1 text-xs text-muted-foreground">
                  GL matches stock ledger at cost.
                </p>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium text-foreground">Assets</p>
            {bs.assets.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1">
                {bs.assets.map((r) => (
                  <li key={r.code} className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 text-muted-foreground">
                      {r.code} {r.name}
                    </span>
                    <span className="font-money">{formatTzs(r.balance)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-2 font-semibold">
              <span>Total assets</span>
              <span className="font-money">{formatTzs(bs.totalAssets)}</span>
            </p>
          </div>
          <div>
            <p className="mb-2 font-medium text-foreground">
              Liabilities &amp; equity
            </p>
            {[...bs.liabilities, ...bs.equity].map((r) => (
              <div
                key={`${r.code}-${r.name}`}
                className="flex flex-wrap justify-between gap-2 py-0.5"
              >
                <span
                  className={
                    r.isComputed
                      ? "min-w-0 italic text-muted-foreground"
                      : "min-w-0 text-muted-foreground"
                  }
                >
                  {r.code} {r.name}
                </span>
                <span className="font-money">{formatTzs(r.balance)}</span>
              </div>
            ))}
            <p className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-2 font-semibold">
              <span>Total liabilities + equity</span>
              <span className="font-money">
                {formatTzs(bs.totalLiabilitiesAndEquity)}
              </span>
            </p>
          </div>
          {!bs.isBalanced ? (
            <p className="text-xs text-destructive">
              Out of balance by {formatTzs(Math.abs(bs.balanceVariance))} —
              check for unposted entries or misclassified transactions (e.g.
              bank deposit recorded as expense).
            </p>
          ) : (
            <p className="text-xs text-inflow">Balance sheet balances.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Trial balance</CardTitle>
          <p className="text-sm text-muted-foreground">
            All posted accounts as of {bs.asOfDate}
          </p>
        </CardHeader>
        <CardContent>
          {trialBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No journal activity yet. Complete a sale or expense to populate the
              GL.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialBalance.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right">
                      {formatTzs(row.total_debit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatTzs(row.total_credit)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatTzs(row.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
