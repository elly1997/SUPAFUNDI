"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSupplierDetail, paySupplierBill } from "@/lib/actions/suppliers";
import { formatTzs } from "@/lib/utils/currency";

type Props = { supplierId: string };

export function SupplierDetailClient({ supplierId }: Props) {
  const [payOpen, setPayOpen] = useState(false);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const queryClient = useQueryClient();

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["supplier", supplierId],
    queryFn: () => getSupplierDetail(supplierId),
  });

  const payMut = useMutation({
    mutationFn: () =>
      paySupplierBill({
        billId,
        amount: Number(amount),
        paymentMethod: "cash",
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payment recorded");
        setPayOpen(false);
        setAmount("");
        queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] });
      } else toast.error(r.message);
    },
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

  return (
    <div className="space-y-6">
      <Card className="dash-stat-card border-warning/30">
        <CardHeader>
          <CardTitle>{supplier.name}</CardTitle>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Open bills</CardTitle>
          <Button
            size="sm"
            disabled={supplier.bills.filter((b) => b.balance > 0).length === 0}
            onClick={() => setPayOpen(true)}
          >
            Pay supplier
          </Button>
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

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay supplier bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Bill</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-surface-1 px-2 text-sm"
                value={billId}
                onChange={(e) => setBillId(e.target.value)}
              >
                <option value="">Select bill</option>
                {supplier.bills
                  .filter((b) => b.balance > 0)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bill_no} — {formatTzs(b.balance)} due
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                className="font-money"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!billId || !amount || payMut.isPending}
              onClick={() => payMut.mutate()}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
