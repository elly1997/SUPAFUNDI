"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SaleListRow } from "@/lib/actions/sales";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { formatDateTimeEAT } from "@/lib/utils/currency";

type Props = {
  sales: SaleListRow[];
};

export function SalesListClient({ sales }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Sales</CardTitle>
          <CardDescription>
            Completed invoices from POS and future channels.
          </CardDescription>
        </div>
        <Link href="/pos" className={cn(buttonVariants())}>
          Open POS
        </Link>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sales yet. Complete a sale from the POS terminal.
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
                  <TableCell className="text-right">
                    {formatTzs(sale.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTzs(sale.amount_paid)}
                  </TableCell>
                  <TableCell className="text-right">
                    {sale.balance_due > 0 ? (
                      <span className="text-warning">
                        {formatTzs(sale.balance_due)}
                      </span>
                    ) : (
                      "—"
                    )}
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
