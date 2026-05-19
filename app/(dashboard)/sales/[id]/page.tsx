import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getSaleById } from "@/lib/actions/sales";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateTimeEAT } from "@/lib/utils/currency";

type SalesDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SalesDetailPage({
  params,
}: SalesDetailPageProps) {
  const { id } = await params;
  const sale = await getSaleById(id);
  if (!sale) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {sale.invoice_no}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTimeEAT(sale.sale_date)} · {sale.status}
          </p>
        </div>
        <Link href="/sales" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to sales
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              {sale.customer_name
                ? `Customer: ${sale.customer_name}`
                : "Walk-in sale"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatTzs(sale.subtotal)}</span>
            </div>
            {sale.discount_amount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatTzs(sale.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                VAT ({sale.tax_rate}%)
              </span>
              <span>{formatTzs(sale.tax_amount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span>{formatTzs(sale.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>{formatTzs(sale.amount_paid)}</span>
            </div>
            {sale.balance_due > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Balance due</span>
                <span>{formatTzs(sale.balance_due)}</span>
              </div>
            )}
            {sale.change_given > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Change</span>
                <span>{formatTzs(sale.change_given)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {sale.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">{sale.notes}</CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.items.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatTzs(item.unit_price)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTzs(item.total_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
