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
import { getCustomerById } from "@/lib/actions/customers";
import { cn } from "@/lib/utils";
import { formatTzs, formatDateTimeEAT } from "@/lib/utils/currency";

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
        <Link href="/customers" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
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
