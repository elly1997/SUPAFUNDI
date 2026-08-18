"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { InvoiceCreateDialog } from "@/components/invoices/invoice-create-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
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
  INVOICE_TAB_TYPES,
  type InvoiceTabId,
  saleTypeLabel,
} from "@/lib/constants/sale-documents";
import {
  cancelDraftSale,
  listSaleDocuments,
} from "@/lib/actions/invoices";
import { cn } from "@/lib/utils";
import { formatDateTimeEAT, formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

export function InvoicesPageClient() {
  const [tab, setTab] = useState<InvoiceTabId>("invoices");
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const outletId = useAuthStore((s) => s.activeOutletId);

  const tabConfig = INVOICE_TAB_TYPES.find((t) => t.id === tab)!;
  const balanceDueMin =
    "balanceDueMin" in tabConfig ? tabConfig.balanceDueMin : undefined;
  const customerRequired =
    "customerRequired" in tabConfig ? tabConfig.customerRequired : undefined;
  const statusFilter =
    "status" in tabConfig ? [...tabConfig.status] : undefined;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sale-documents", tab, outletId],
    queryFn: () =>
      listSaleDocuments({
        saleTypes: [...tabConfig.types],
        balanceDueMin,
        customerRequired,
        status: statusFilter,
        limit: 100,
      }),
    enabled: !!outletId,
  });

  const summary = useMemo(() => {
    const drafts = rows.filter((r) => r.status === "draft").length;
    const unpaid = rows.filter((r) => r.balance_due > 0).length;
    const total = rows.reduce((s, r) => s + r.total_amount, 0);
    return { drafts, unpaid, total };
  }, [rows]);

  const cancelMut = useMutation({
    mutationFn: cancelDraftSale,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Draft cancelled");
        queryClient.invalidateQueries({ queryKey: ["sale-documents"] });
      } else toast.error(r.message);
    },
  });

  const canCreate = tab !== "invoices";
  const showDue = tab === "invoices";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {INVOICE_TAB_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-2xl font-bold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Drafts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-2xl font-bold text-warning">
              {summary.drafts}
            </p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-2xl font-bold text-inflow">
              {formatTzs(summary.total)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            {tabConfig.label}
          </CardTitle>
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              New {tabConfig.label.replace(/s$/, "")}
            </Button>
          ) : (
            <Link href="/pos" className={cn(buttonVariants({ variant: "secondary" }))}>
              Open POS
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {tab === "invoices"
                ? "No open customer invoices. Invoices appear here when a registered customer buys on credit or has an unpaid balance."
                : `No ${tabConfig.label.toLowerCase()} yet.`}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {showDue ? <TableHead>Due date</TableHead> : null}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.invoice_no}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {saleTypeLabel(row.sale_type)}
                    </TableCell>
                    <TableCell>{row.customer_name ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeEAT(row.sale_date)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-xs capitalize",
                          row.status === "draft" && "bg-warning/15 text-warning",
                          row.status === "completed" &&
                            "bg-inflow/15 text-inflow",
                          row.status === "cancelled" &&
                            "bg-muted text-muted-foreground",
                          row.is_overdue && "bg-destructive/15 text-destructive"
                        )}
                      >
                        {row.is_overdue ? "overdue" : row.status}
                      </span>
                    </TableCell>
                    {showDue ? (
                      <TableCell className="text-xs text-muted-foreground">
                        {row.due_date ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right font-money">
                      {formatTzs(row.total_amount)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-money",
                        row.balance_due > 0 && "text-warning"
                      )}
                    >
                      {formatTzs(row.balance_due)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "draft" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => cancelMut.mutate(row.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canCreate ? (
        <InvoiceCreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultType={tabConfig.types[0]}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["sale-documents"] })
          }
        />
      ) : null}
    </div>
  );
}

