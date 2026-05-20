"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
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
import { listRecentSales } from "@/lib/actions/sales";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateTimeEAT } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";

export function SalesListClient() {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const [fromDate, setFromDate] = useState(
    format(subDays(new Date(businessDate + "T12:00:00"), 7), "yyyy-MM-dd")
  );
  const [toDate, setToDate] = useState(businessDate);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-list", fromDate, toDate],
    queryFn: () => listRecentSales(200, { fromDate, toDate }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Sales</CardTitle>
          <CardDescription>
            Filter by date range. New POS sales use the business date from the
            header when backdating.
          </CardDescription>
        </div>
        <Link href="/pos" className={cn(buttonVariants())}>
          Open POS
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <DateRangePicker
          label="Sales date range"
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
        />
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sales in this date range.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="font-medium text-primary hover:underline"
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
                  <TableCell className="text-right font-money">
                    {formatTzs(sale.balance_due)}
                  </TableCell>
                  <TableCell className="capitalize">{sale.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
