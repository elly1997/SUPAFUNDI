import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { InvoiceDocumentActions } from "@/components/invoices/invoice-print-button";
import { IssueDraftSaleCard } from "@/components/invoices/issue-draft-sale-card";
import { SaleVoidActions } from "@/components/sales/sale-void-actions";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getOrganizationSettings } from "@/lib/actions/settings";
import { getSaleById } from "@/lib/actions/sales";
import { buildSaleDocumentPrintData } from "@/lib/invoices/print-data";
import { loadPaymentAccountsForPrint } from "@/lib/invoices/payment-accounts-print";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { cn } from "@/lib/utils";
import { formatDateEAT, formatDateTimeEAT, formatTzs } from "@/lib/utils/currency";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Props) {
  const { id } = await params;
  const [sale, org, paymentAccounts] = await Promise.all([
    getSaleById(id),
    getOrganizationSettings(),
    loadPaymentAccountsForPrint(),
  ]);
  if (!sale) notFound();

  const orgName = org?.name ?? "SUPAFUNDI TRADERS";
  const printData = buildSaleDocumentPrintData({
    organizationName: orgName,
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
  });

  const isDraftDoc =
    sale.sale_type === "quotation" ||
    sale.sale_type === "proforma" ||
    sale.sale_type === "delivery_note";

  return (
    <div className="space-y-6">
      <PageHeader
        title={sale.invoice_no}
        description={`${saleTypeLabel(sale.sale_type)} · ${sale.status}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <InvoiceDocumentActions
              printData={printData}
              customerPhone={sale.customer_phone}
              showWhatsApp={isDraftDoc || !!sale.customer_id}
            />
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
            {printData.validUntil ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Valid until {printData.validUntil}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {sale.customer_name ? (
        <div className="text-sm text-muted-foreground">
          <p>
            Customer:{" "}
            <span className="font-medium text-foreground">{sale.customer_name}</span>
          </p>
          {sale.customer_phone ? (
            <p>Tel: {sale.customer_phone}</p>
          ) : null}
          {sale.customer_email ? (
            <p>Email: {sale.customer_email}</p>
          ) : null}
        </div>
      ) : null}

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
                  <TableCell>
                    {item.product_name}
                    {item.unit ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({item.unit})
                      </span>
                    ) : null}
                  </TableCell>
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

      {sale.status === "draft" && isDraftDoc ? (
        <IssueDraftSaleCard
          saleId={sale.id}
          totalAmount={sale.total_amount}
          hasCustomer={!!sale.customer_id}
        />
      ) : null}

      {sale.status === "draft" ? (
        <p className="text-sm text-muted-foreground">
          Use <strong>Print A4</strong> or <strong>Share quote</strong> to send this{" "}
          {saleTypeLabel(sale.sale_type).toLowerCase()} to the customer. Finalize from
          POS when they pay.
        </p>
      ) : sale.customer_id && sale.balance_due > 0 ? (
        <p className="text-sm text-muted-foreground">
          Print the A4 invoice and hand it to the customer with bank / M-Pesa payment
          details at the bottom.
        </p>
      ) : (
        <Link href={`/sales/${sale.id}`} className={cn(buttonVariants())}>
          View in sales history
        </Link>
      )}
    </div>
  );
}
