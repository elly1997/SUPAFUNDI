"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
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
import { formatTzs } from "@/lib/utils/currency";
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
        Select an active outlet to view cash session history.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="mx-auto size-8 animate-spin" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sessions yet. Open a drawer from the POS terminal.
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
                    {new Date(s.opened_at).toLocaleString()}
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
        <Link
          href="/pos"
          className={cn(buttonVariants(), "mt-4 rounded-xl")}
        >
          Open / close session on POS
        </Link>
      </CardContent>
    </Card>
  );
}
