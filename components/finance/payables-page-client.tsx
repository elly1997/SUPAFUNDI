"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { fetchSuppliers, invalidateSupplierQueries } from "@/lib/api/suppliers-fetch";
import {
  createManualBillApi,
  fetchOpenPayables,
  paySupplierBillApi,
} from "@/lib/api/daily-ops-fetch";
import { fetchPosPaymentAccounts } from "@/lib/api/banking-fetch";
import type { PayableBillRow } from "@/lib/actions/payables";
import {
  formatAccountDetails,
  paymentAccountTypeLabel,
} from "@/lib/constants/payment-accounts";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type SupplierPayMethod = "cash" | "mpesa" | "bank_transfer" | "cheque";

function formatPayableBillLabel(b: PayableBillRow): string {
  return `${b.bill_no} · ${b.supplier_name}`;
}

export function PayablesPageClient() {
  const queryClient = useQueryClient();
  const [billOpen, setBillOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billAmount, setBillAmount] = useState("");
  const [payBillId, setPayBillId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SupplierPayMethod>("cash");
  const [paymentDate, setPaymentDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentRef, setPaymentRef] = useState("");

  const { data: bills = [], isLoading } = useQuery({
    queryKey: ["payables-open"],
    queryFn: fetchOpenPayables,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: fetchSuppliers,
  });

  const totalDue = bills.reduce((s, b) => s + b.balance, 0);

  const selectedPayBill = useMemo(
    () => bills.find((b) => b.id === payBillId),
    [bills, payBillId]
  );

  const needsBankPicker = paymentMethod === "bank_transfer";

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["pos-accounts", "bank_transfer", "payables"],
    enabled: payOpen && needsBankPicker,
    queryFn: () => fetchPosPaymentAccounts("bank_transfer"),
  });

  const showBankAccountSelect =
    needsBankPicker && bankAccounts.length > 1;

  useEffect(() => {
    if (!payOpen || !needsBankPicker) return;
    if (bankAccounts.length === 1) {
      setBankAccountId(bankAccounts[0]!.id);
    } else if (bankAccounts.length !== 1) {
      setBankAccountId("");
    }
  }, [payOpen, needsBankPicker, bankAccounts]);

  useEffect(() => {
    if (!payOpen) return;
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("cash");
    setBankAccountId("");
    setPaymentRef("");
  }, [payOpen]);

  useEffect(() => {
    if (!payOpen || payBillId || bills.length === 0) return;
    setPayBillId(bills[0]!.id);
    setPayAmount(String(bills[0]!.balance));
  }, [payOpen, payBillId, bills]);

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

  const payAmountNum = Number(payAmount);
  const payAmountInvalid =
    !payAmount ||
    !Number.isFinite(payAmountNum) ||
    payAmountNum <= 0 ||
    (selectedPayBill != null && payAmountNum > selectedPayBill.balance);

  const payMut = useMutation({
    mutationFn: () => {
      if (!selectedPayBill) {
        throw new Error("Select a bill");
      }
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (amt > selectedPayBill.balance) {
        throw new Error(
          `Amount cannot exceed balance due (${formatTzs(selectedPayBill.balance)})`
        );
      }
      if (showBankAccountSelect && !bankAccountId) {
        throw new Error("Select a bank account");
      }
      return paySupplierBillApi({
        billId: payBillId,
        amount: amt,
        paymentMethod,
        paymentDate,
        bankAccountId: bankAccountId || undefined,
        referenceNo: paymentRef.trim() || undefined,
      });
    },
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay supplier bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <Label>Bill</Label>
              <Select
                value={payBillId}
                onValueChange={(v) => {
                  const id = v ?? "";
                  setPayBillId(id);
                  const bill = bills.find((b) => b.id === id);
                  if (bill) setPayAmount(String(bill.balance));
                }}
              >
                <SelectTrigger>
                  <span className="truncate">
                    {selectedPayBill
                      ? formatPayableBillLabel(selectedPayBill)
                      : "Select bill"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {bills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {formatPayableBillLabel(b)} · {formatTzs(b.balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPayBill && (
                <p className="form-hint">
                  Balance due:{" "}
                  <span className="font-money font-semibold text-warning">
                    {formatTzs(selectedPayBill.balance)}
                  </span>
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Payment date</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (TZS)</Label>
                <Input
                  type="number"
                  min={1}
                  max={selectedPayBill?.balance}
                  className="font-money"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
            </div>
            {payAmountInvalid && selectedPayBill && payAmountNum > 0 && (
              <p className="text-xs text-destructive">
                Amount cannot exceed {formatTzs(selectedPayBill.balance)}
              </p>
            )}
            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v as SupplierPayMethod);
                  setBankAccountId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {showBankAccountSelect && (
              <div className="space-y-2">
                <Label>Bank account</Label>
                <Select
                  value={bankAccountId}
                  onValueChange={(v) => setBankAccountId(v ?? "")}
                >
                  <SelectTrigger>
                    <span className="truncate">
                      {bankAccounts.find((a) => a.id === bankAccountId)?.name ??
                        "Select account"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        <span className="ml-1 text-muted-foreground">
                          · {paymentAccountTypeLabel(a.account_type)}
                          {formatAccountDetails(a) !== "—"
                            ? ` · ${formatAccountDetails(a)}`
                            : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="form-hint">
                  Withdrawal is recorded against this account in Banking.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Reference (optional)</Label>
              <Input
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="M-Pesa code, cheque no., transfer ref…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => payMut.mutate()}
              disabled={
                !payBillId ||
                payAmountInvalid ||
                payMut.isPending ||
                (showBankAccountSelect && !bankAccountId)
              }
            >
              {payMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
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
