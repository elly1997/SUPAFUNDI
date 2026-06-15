import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocumentActions } from "@/components/invoices/invoice-print-button";
import { SaleVoidActions } from "@/components/sales/sale-void-actions";
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
import { getOrganizationSettings } from "@/lib/actions/settings";
import { getSaleById } from "@/lib/actions/sales";
import { buildSaleDocumentPrintData } from "@/lib/invoices/print-data";
import { loadPaymentAccountsForPrint } from "@/lib/invoices/payment-accounts-print";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateTimeEAT, formatDateEAT } from "@/lib/utils/currency";

type SalesDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SalesDetailPage({
  params,
}: SalesDetailPageProps) {
  const { id } = await params;
  const [sale, org, paymentAccounts] = await Promise.all([
    getSaleById(id),
    getOrganizationSettings(),
    loadPaymentAccountsForPrint(),
  ]);
  if (!sale) {
    notFound();
  }

  const showCustomerInvoice =
    !!sale.customer_id &&
    sale.status === "completed" &&
    (sale.sale_type === "retail" || sale.sale_type === "wholesale");

  const printData = showCustomerInvoice
    ? buildSaleDocumentPrintData({
        organizationName: org?.name ?? "SUPAFUNDI TRADERS",
        address: org?.address,
        phone: org?.phone,
        email: org?.email,
        taxId: org?.tax_id,
        saleType: sale.sale_type,
        invoiceNo: sale.invoice_no,
        documentDate: formatDateEAT(sale.sale_date),
        customerName: sale.customer_name,
        customerPhone: sale.customer_phone,
        customerEmail: sale.customer_email,
        status: sale.status,
        items: sale.items,
        subtotal: sale.subtotal,
        discountAmount: sale.discount_amount,
        taxRate: sale.tax_rate,
        taxAmount: sale.tax_amount,
        totalAmount: sale.total_amount,
        amountPaid: sale.amount_paid,
        balanceDue: sale.balance_due,
        notes: sale.notes,
        paymentAccounts,
      })
    : null;

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
        <div className="flex flex-wrap gap-2">
          {printData ? (
            <InvoiceDocumentActions
              printData={printData}
              customerPhone={sale.customer_phone}
              showWhatsApp={sale.balance_due > 0}
            />
          ) : null}
          <SaleVoidActions
            saleId={sale.id}
            invoiceNo={sale.invoice_no}
            status={sale.status}
          />
          <Link
            href="/sales"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to sales
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              {sale.customer_name
                ? `Customer: ${sale.customer_name}`
                : "Walk-in sale"}
              {sale.customer_phone ? ` · ${sale.customer_phone}` : ""}
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
                  <TableCell>
                    {item.product_name}
                    {item.unit ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({item.unit})
                      </span>
                    ) : null}
                  </TableCell>
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

      {showCustomerInvoice && sale.balance_due > 0 ? (
        <p className="text-sm text-muted-foreground">
          Use <strong>Print A4</strong> to hand the customer a formal invoice
          with SUPAFUNDI letterhead and bank / M-Pesa payment details.
        </p>
      ) : null}
    </div>
  );
}
