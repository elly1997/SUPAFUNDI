"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { listCashSessionHistory } from "@/lib/actions/cash-sessions";
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
import { formatDateEAT, formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

export function CashSessionsPageClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["cash-sessions-history", outletId],
    queryFn: () => listCashSessionHistory(outletId),
    enabled: !!outletId,
  });

  if (!outletId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an active outlet in the header to open or view cash sessions.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="dash-stat-card">
        <CardHeader>
          <CardTitle className="text-base">Cash drawer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Open the drawer with your opening float, then continue to POS to sell.
          </p>
          <CashSessionBar
            outletId={outletId}
            variant="inline"
            redirectAfterOpen="/pos"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Recent sessions</CardTitle>
          <Link href="/pos" className={cn(buttonVariants({ size: "sm" }))}>
            Go to POS
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="mx-auto size-8 animate-spin" />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sessions yet. Use Open drawer above to start.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opened</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Closed</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">
                      {formatDateEAT(s.opened_at)}
                    </TableCell>
                    <TableCell className="capitalize">{s.status}</TableCell>
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
                        s.variance != null && s.variance !== 0 && "text-warning"
                      )}
                    >
                      {s.variance != null ? formatTzs(s.variance) : "—"}
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
