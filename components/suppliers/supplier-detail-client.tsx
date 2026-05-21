"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PartyStatementDialog } from "@/components/finance/party-statement-dialog";
import { RecordPartyPaymentDialog } from "@/components/finance/record-party-payment-dialog";
import { getSupplierDetail } from "@/lib/actions/suppliers";
import { formatTzs } from "@/lib/utils/currency";

type Props = { supplierId: string };

export function SupplierDetailClient({ supplierId }: Props) {
  const [payOpen, setPayOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [billId, setBillId] = useState<string | undefined>();
  const queryClient = useQueryClient();

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplierDetail(supplierId),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-8 animate-spin" />
      </div>
    );
  }

  if (!supplier) {
    return <p className="text-muted-foreground">Supplier not found.</p>;
  }

  const openBills = supplier.bills.filter((b) => b.balance > 0);

  return (
    <div className="space-y-6">
      <Card className="dash-stat-card border-warning/30">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>{supplier.name}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={supplier.payables_balance <= 0}
              onClick={() => {
                setBillId(undefined);
                setPayOpen(true);
              }}
            >
              <Wallet className="mr-2 size-4" />
              Pay supplier
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStmtOpen(true)}>
              <FileText className="mr-2 size-4" />
              Statement
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-muted-foreground">Phone:</span>{" "}
            {supplier.phone ?? "—"}
          </p>
          <p>
            <span className="text-muted-foreground">Payables:</span>{" "}
            <span className="font-money font-semibold text-warning">
              {formatTzs(supplier.payables_balance)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Credit limit:</span>{" "}
            {formatTzs(supplier.credit_limit)}
          </p>
          <p>
            <span className="text-muted-foreground">Credit days:</span>{" "}
            {supplier.credit_days}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {supplier.bills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills on file.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplier.bills.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.bill_no}</TableCell>
                    <TableCell>{b.bill_date}</TableCell>
                    <TableCell className="capitalize">{b.status}</TableCell>
                    <TableCell className="text-right font-money">
                      {formatTzs(b.balance)}
                    </TableCell>
                    <TableCell className="text-right">
                      {b.balance > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setBillId(b.id);
                            setPayOpen(true);
                          }}
                        >
                          Pay
                        </Button>
                      )}
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
          <CardTitle>Purchase orders</CardTitle>
        </CardHeader>
        <CardContent>
          {supplier.purchase_orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchase orders.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {supplier.purchase_orders.map((po) => (
                <li key={po.id}>
                  <Link
                    href={`/inventory/purchase-orders/${po.id}`}
                    className="text-primary hover:underline"
                  >
                    {po.reference_no ?? po.id.slice(0, 8)}
                  </Link>{" "}
                  · {po.status} · {formatTzs(po.total_amount)}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RecordPartyPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        partyType="supplier"
        partyId={supplierId}
        partyName={supplier.name}
        maxAmount={supplier.payables_balance}
        billId={billId}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] })
        }
      />
      <PartyStatementDialog
        open={stmtOpen}
        onOpenChange={setStmtOpen}
        partyType="supplier"
        partyId={supplierId}
        partyName={supplier.name}
      />
    </div>
  );
}
