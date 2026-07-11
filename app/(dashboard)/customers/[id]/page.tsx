import Link from "next/link";
import { notFound } from "next/navigation";
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
import { CustomerDepositForm } from "@/components/customers/customer-deposit-form";
import { CustomerDetailActions } from "@/components/customers/customer-detail-client";
import { getCustomerById } from "@/lib/actions/customers";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateEAT, formatDateTimeEAT } from "@/lib/utils/currency";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {customer.customer_type} · {customer.phone ?? "No phone"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomerDetailActions
            customerId={customer.id}
            customerName={customer.name}
            outstandingBalance={customer.outstanding_balance}
          />
          <Link href="/customers" className={cn(buttonVariants({ variant: "outline" }))}>
            Back
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credit limit</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {formatTzs(customer.credit_limit)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-semibold text-warning">
            {formatTzs(customer.outstanding_balance)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deposit balance</CardTitle>
          </CardHeader>
          <CardContent className="font-money text-xl font-semibold text-inflow">
            {formatTzs(customer.deposit_balance)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terms</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {customer.credit_days} days · {customer.price_type} pricing
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record deposit</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerDepositForm
            customerId={customer.id}
            customerName={customer.name}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Deposit account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Prepaid balance available for on-account sales — check dates and
            amounts before checkout.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-1/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Available now
              </p>
              <p className="font-money mt-1 text-xl font-semibold text-inflow">
                {formatTzs(customer.depositSummary.balance)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-1/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total received
              </p>
              <p className="font-money mt-1 text-lg font-semibold">
                {formatTzs(customer.depositSummary.total_received)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-1/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Applied to invoices
              </p>
              <p className="font-money mt-1 text-lg font-semibold">
                {formatTzs(customer.depositSummary.total_applied)}
              </p>
            </div>
          </div>

          {customer.depositLedger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deposit receipts yet. Record a deposit above — the date and
              amount will appear here for cashier reference.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date recorded</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.depositLedger.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {row.date
                        ? formatDateEAT(`${row.date}T12:00:00.000Z`)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                      {row.reference}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {row.payment_method ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-money text-sm text-inflow">
                      {row.amount_in > 0 ? formatTzs(row.amount_in) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-money text-sm text-warning">
                      {row.amount_out > 0 ? formatTzs(row.amount_out) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-money text-sm font-semibold">
                      {formatTzs(row.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.recentSales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Deposit used</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.recentSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/sales/${s.id}`} className="text-primary hover:underline">
                        {s.invoice_no}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDateTimeEAT(s.sale_date)}</TableCell>
                    <TableCell className="text-right">{formatTzs(s.total_amount)}</TableCell>
                    <TableCell className="text-right text-inflow">
                      {s.deposit_applied > 0 ? formatTzs(s.deposit_applied) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.balance_due > 0 ? formatTzs(s.balance_due) : "—"}
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
