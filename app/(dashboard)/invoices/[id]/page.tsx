import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SaleVoidActions } from "@/components/sales/sale-void-actions";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getSaleById } from "@/lib/actions/sales";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { cn } from "@/lib/utils";
import { formatDateTimeEAT, formatTzs } from "@/lib/utils/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: { id: string } };

export default async function InvoiceDetailPage({ params }: Props) {
  const sale = await getSaleById(params.id);
  if (!sale) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.invoice_no}
        description={`${saleTypeLabel(sale.sale_type)} · ${sale.status}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <SaleVoidActions
              saleId={sale.id}
              invoiceNo={sale.invoice_no}
              status={sale.status}
            />
            <Link
              href="/invoices"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold">{formatTzs(sale.total_amount)}</p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold text-inflow">
              {formatTzs(sale.amount_paid)}
            </p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Balance due</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold text-warning">
              {formatTzs(sale.balance_due)}
            </p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{formatDateTimeEAT(sale.sale_date)}</p>
          </CardContent>
        </Card>
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
              {sale.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.product_name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(item.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(item.total_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {sale.status === "draft" ? (
        <p className="text-sm text-muted-foreground">
          Finalize this document from POS or convert to a completed sale when the
          customer pays.
        </p>
      ) : (
        <Link href={`/sales/${sale.id}`} className={cn(buttonVariants())}>
          View in sales history
        </Link>
      )}
    </div>
  );
}
