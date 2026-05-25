"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getFinancialReports } from "@/lib/actions/reports";
import { formatTzs } from "@/lib/utils/currency";

type FinancialReportsProps = {
  fromDate?: string;
  toDate?: string;
};

export function FinancialReports({ fromDate, toDate }: FinancialReportsProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["financial-reports", fromDate, toDate],
    queryFn: () => getFinancialReports(fromDate, toDate),
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

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Profit &amp; loss (all posted entries)</CardTitle>
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
            <span className={pl.netIncome >= 0 ? "text-inflow" : "text-destructive"}>
              {formatTzs(pl.netIncome)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Balance sheet (posted balances)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
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
              <div key={r.code} className="flex flex-wrap justify-between gap-2 py-0.5">
                <span className="min-w-0 text-muted-foreground">
                  {r.code} {r.name}
                </span>
                <span className="font-money">{formatTzs(r.balance)}</span>
              </div>
            ))}
            <p className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-2 font-semibold">
              <span>Total L + E</span>
              <span className="font-money">
                {formatTzs(bs.totalLiabilities + bs.totalEquity)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Trial balance</CardTitle>
        </CardHeader>
        <CardContent>
          {trialBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No journal activity yet. Complete a sale or expense to populate the GL.
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
