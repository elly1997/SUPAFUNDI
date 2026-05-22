"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOpenPayables } from "@/lib/actions/payables";
import { fetchSuppliers, invalidateSupplierQueries } from "@/lib/api/suppliers-fetch";
import {
  createManualBillApi,
  paySupplierBillApi,
} from "@/lib/api/daily-ops-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

export function PayablesPageClient() {
  const queryClient = useQueryClient();
  const [billOpen, setBillOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billAmount, setBillAmount] = useState("");
  const [payBillId, setPayBillId] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["payables-open"],
    queryFn: listOpenPayables,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: fetchSuppliers,
  });

  const totalDue = bills.reduce((s, b) => s + b.balance, 0);

  const createMut = useMutation({
    mutationFn: () =>
      createManualBillApi({
        supplierId,
        billDate,
        totalAmount: Number(billAmount),
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Bill created");
        setBillOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["payables-open"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Bill create failed"),
  });

  const payMut = useMutation({
    mutationFn: () =>
      paySupplierBillApi({
        billId: payBillId,
        amount: Number(payAmount),
        paymentMethod: "bank_transfer",
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payment recorded");
        setPayOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["payables-open"] });
        invalidateSupplierQueries(queryClient);
        void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Payment failed"),
  });

  return (
    <div className="space-y-6">
      <Card className="glass-card border-warning/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <p className="text-sm text-muted-foreground">Total payables due</p>
            <p className="font-money text-2xl font-bold text-warning">
              {formatTzs(totalDue)}
            </p>
            <p className="text-xs text-muted-foreground">
              {bills.length} open bill(s) · GRN on-account creates bills automatically
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setBillOpen(true)}>
              <Plus className="mr-2 size-4" />
              New bill
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={bills.length === 0}
              onClick={() => setPayOpen(true)}
            >
              Pay bill
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Open supplier bills</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="mx-auto size-8 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No open bills. Receive stock on supplier account or add a manual
                      bill.
                    </TableCell>
                  </TableRow>
                ) : (
                  bills.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-mono text-xs">{b.bill_no}</TableCell>
                      <TableCell>
                        {b.supplier_id ? (
                          <Link
                            href={`/suppliers/${b.supplier_id}`}
                            className="text-primary hover:underline"
                          >
                            {b.supplier_name}
                          </Link>
                        ) : (
                          b.supplier_name
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{b.bill_date}</TableCell>
                      <TableCell className="text-right font-money font-semibold">
                        {formatTzs(b.balance)}
                      </TableCell>
                      <TableCell className="capitalize text-xs">{b.status}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayBillId(b.id);
                            setPayAmount(String(b.balance));
                            setPayOpen(true);
                          }}
                        >
                          Pay
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New supplier bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Supplier</Label>
              <Select
                value={supplierId}
                onValueChange={(v) => setSupplierId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bill date</Label>
              <Input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Total (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!supplierId || !billAmount || createMut.isPending}
            >
              Create bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay supplier bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Bill</Label>
              <Select
                value={payBillId}
                onValueChange={(v) => setPayBillId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bill" />
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bill_no} — {b.supplier_name} ({formatTzs(b.balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => payMut.mutate()}
              disabled={!payBillId || !payAmount || payMut.isPending}
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Tip: use{" "}
        <Link href="/inventory/receive" className={cn(buttonVariants({ variant: "link" }), "h-auto p-0")}>
          Receive goods
        </Link>{" "}
        with payment <strong>On account</strong> to auto-create bills from GRNs.
      </p>
    </div>
  );
}
