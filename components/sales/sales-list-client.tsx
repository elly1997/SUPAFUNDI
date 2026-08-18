"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Loader2, Search } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";
import { SaleVoidActions } from "@/components/sales/sale-void-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchSalesPage } from "@/lib/api/sales-list-fetch";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateTimeEAT } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import { useAuthStore } from "@/stores/authStore";

const PAGE_SIZE = 50;

export function SalesListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [fromDate, setFromDate] = useState(
    format(subDays(new Date(businessDate + "T12:00:00"), 7), "yyyy-MM-dd")
  );
  const [toDate, setToDate] = useState(businessDate);

  useEffect(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) setFromDate(from);
    if (to) setToDate(to);
  }, [searchParams]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const deferredInvoiceSearch = useDeferredValue(invoiceSearch);
  const [lookupPending, setLookupPending] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, deferredInvoiceSearch]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["sales-list", "page", outletId, fromDate, toDate, deferredInvoiceSearch, page],
    queryFn: () =>
      fetchSalesPage({
        page,
        pageSize: PAGE_SIZE,
        fromDate,
        toDate,
        invoiceSearch: deferredInvoiceSearch,
        outletId,
      }),
    enabled: !!outletId,
    placeholderData: keepPreviousData,
  });
  const sales = data?.sales ?? [];
  const total = data?.total ?? 0;
  const firstItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, total);

  async function goToInvoice() {
    const q = invoiceSearch.trim();
    if (!q) return;
    setLookupPending(true);
    try {
      const res = await fetch(
        `/api/sales/lookup?invoice=${encodeURIComponent(q)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (res.status === 404) {
        toast.error(`No sale found for invoice ${q}`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Lookup failed");
      }
      const body = (await res.json()) as { sale: { id: string } };
      router.push(`/sales/${body.sale.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupPending(false);
    }
  }

  return (
    <Card className="overflow-visible">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sales</CardTitle>
          <CardDescription>
            Filter by date range. New POS sales use the business date from the
            header when backdating.
          </CardDescription>
        </div>
        <Link href="/pos" className={cn(buttonVariants(), "w-full sm:w-auto")}>
          Open POS
        </Link>
      </CardHeader>
      <CardContent className="space-y-4 overflow-visible">
        <DateRangePicker
          label="Sales date range"
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="invoice-search"
              className="text-xs font-medium text-muted-foreground"
            >
              Receipt / invoice #
            </label>
            <div className="flex gap-2">
              <Input
                id="invoice-search"
                placeholder="e.g. MAIN-2026-00042"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void goToInvoice();
                }}
                className="font-mono"
              />
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
                disabled={lookupPending || !invoiceSearch.trim()}
                onClick={() => void goToInvoice()}
              >
                {lookupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                <span className="sr-only">Find sale</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Filter the list below or press Enter to open a sale by exact invoice
              number. Managers can void completed sales from the list or detail page.
            </p>
          </div>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {deferredInvoiceSearch.trim()
              ? "No sales match this invoice filter."
              : "No sales in this date range."}
          </p>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {sales.map((sale) => (
              <div key={sale.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/sales/${sale.id}`}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {sale.invoice_no}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {saleTypeLabel(sale.sale_type)} · {formatDateTimeEAT(sale.sale_date)}
                    </p>
                    <p className="mt-1 truncate text-sm">{sale.customer_name ?? "Walk-in customer"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                    {sale.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground">Total</span>
                    <p className="font-money font-semibold">{formatTzs(sale.total_amount)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Paid</span>
                    <p className="font-money">{formatTzs(sale.amount_paid)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {sale.payment_summary}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Due</span>
                    <p className="font-money">{formatTzs(sale.balance_due)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/sales/${sale.id}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    View
                  </Link>
                  <SaleVoidActions
                    saleId={sale.id}
                    invoiceNo={sale.invoice_no}
                    status={sale.status}
                    compact
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="-mx-1 hidden overflow-x-auto overscroll-x-contain pb-1 md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {sale.invoice_no}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {saleTypeLabel(sale.sale_type)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTimeEAT(sale.sale_date)}
                  </TableCell>
                  <TableCell>{sale.customer_name ?? "—"}</TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(sale.total_amount)}
                  </TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(sale.amount_paid)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {sale.payment_summary}
                  </TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(sale.balance_due)}
                  </TableCell>
                  <TableCell className="capitalize">{sale.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/sales/${sale.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "rounded-md px-3 text-xs"
                        )}
                      >
                        View
                      </Link>
                      <SaleVoidActions
                        saleId={sale.id}
                        invoiceNo={sale.invoice_no}
                        status={sale.status}
                        compact
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {firstItem}-{lastItem} of {total} sales
              {isFetching ? " · refreshing…" : ""}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!data?.hasMore || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
