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
import { CustomerDepositRepairButton } from "@/components/customers/customer-deposit-repair-button";
import { getCustomerById } from "@/lib/actions/customers";
import { customerBalanceView } from "@/lib/utils/customer-balance";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateEAT, formatDateTimeEAT } from "@/lib/utils/currency";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomerById(id);
  if (!customer) notFound();

  const money = customerBalanceView(
    customer.outstanding_balance,
    customer.deposit_balance
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {customer.customer_type}
            {customer.phone ? ` · ${customer.phone}` : ""}
            {` · ${customer.credit_days} day terms · limit ${formatTzs(customer.credit_limit)}`}
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customer owes us
            </CardTitle>
          </CardHeader>
          <CardContent className="font-money text-2xl font-semibold text-warning">
            {formatTzs(money.owesUs)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              We hold (deposit)
            </CardTitle>
          </CardHeader>
          <CardContent className="font-money text-2xl font-semibold text-inflow">
            {formatTzs(money.weHold)}
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net position
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "font-money text-2xl font-semibold",
                money.net > 0
                  ? "text-inflow"
                  : money.net < 0
                    ? "text-warning"
                    : "text-foreground"
              )}
            >
              {money.net === 0
                ? formatTzs(0)
                : money.net > 0
                  ? `Shop holds ${formatTzs(money.net)}`
                  : `Owes net ${formatTzs(-money.net)}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Deposit − credit. On-account sales use deposit first.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record advance payment</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cash today hits the drawer. If they already owe credit, that part
            pays the debt first; only the leftover stays as deposit for later
            stock.
          </p>
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Deposit statement</CardTitle>
              <p className="text-sm text-muted-foreground">
                Prepaid in and out. Ending available must match “We hold”.
              </p>
            </div>
            {customer.depositSummary.ledgerMismatch ? (
              <CustomerDepositRepairButton customerId={customer.id} />
            ) : null}
          </div>
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
                Used (invoices / prior credit)
              </p>
              <p className="font-money mt-1 text-lg font-semibold">
                {formatTzs(customer.depositSummary.total_applied)}
              </p>
            </div>
          </div>

          {customer.depositSummary.ledgerMismatch ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              Statement history does not match the stored deposit balance
              (legacy data). Use <strong>Fix deposit balance</strong> so POS
              and this page agree.
            </p>
          ) : null}

          {customer.depositLedger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No deposit movements yet. Record an advance payment above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
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
          <CardTitle className="text-base">Recent sales</CardTitle>
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
                  <TableHead className="text-right">Still due</TableHead>
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
                    <TableCell className="text-right font-money">
                      {formatTzs(s.total_amount)}
                    </TableCell>
                    <TableCell className="text-right font-money text-inflow">
                      {s.deposit_applied > 0 ? formatTzs(s.deposit_applied) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-money">
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
