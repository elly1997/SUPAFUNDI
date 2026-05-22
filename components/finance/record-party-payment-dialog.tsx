"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { fetchCustomerOpenInvoices } from "@/lib/api/party-statements-fetch";
import { fetchPaymentAccounts } from "@/lib/api/banking-fetch";
async function paySupplierApi(
  params: Parameters<typeof import("@/lib/actions/suppliers").paySupplier>[0]
) {
  const res = await fetch("/api/finance/party-payment/supplier", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<
    { ok: true } | { ok: false; message: string }
  >;
}

async function recordCustomerPaymentApi(
  params: Parameters<typeof import("@/lib/actions/credit").recordCustomerPayment>[0]
) {
  const res = await fetch("/api/finance/party-payment/customer", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<
    { ok: true } | { ok: false; message: string }
  >;
}
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyType: "supplier" | "customer";
  partyId: string;
  partyName: string;
  maxAmount: number;
  billId?: string;
  onSuccess?: () => void;
};

export function RecordPartyPaymentDialog({
  open,
  onOpenChange,
  partyType,
  partyId,
  partyName,
  maxAmount,
  billId,
  onSuccess,
}: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState<
    "cash" | "mpesa" | "bank_transfer" | "cheque"
  >("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [payAll, setPayAll] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const needsBank =
    method === "mpesa" || method === "bank_transfer" || method === "cheque";

  const { data: accounts = [] } = useQuery({
    queryKey: ["payment-accounts", "outbound", method],
    enabled: open && needsBank,
    queryFn: async () => {
      const all = await fetchPaymentAccounts();
      if (method === "bank_transfer" || method === "cheque") {
        return all.filter((a) => a.is_active && a.account_type === "bank");
      }
      return all.filter(
        (a) =>
          a.is_active &&
          (a.account_type === "mpesa" ||
            a.account_type === "lipa" ||
            a.account_type === "till")
      );
    },
  });

  useEffect(() => {
    if (!open || !needsBank) return;
    if (accounts.length === 1) setBankAccountId(accounts[0]!.id);
    else if (accounts.length !== 1) setBankAccountId("");
  }, [open, needsBank, accounts]);

  const { data: invoices = [] } = useQuery({
    queryKey: ["customer-invoices", partyId],
    enabled: open && partyType === "customer",
    queryFn: () => fetchCustomerOpenInvoices(partyId),
  });

  const invoiceTotal = useMemo(
    () => invoices.reduce((s, i) => s + i.balanceDue, 0),
    [invoices]
  );

  useEffect(() => {
    if (!open) return;
    setPaymentDate(today);
    setAmount("");
    setPayAll(false);
    setSelected({});
  }, [open, today]);

  const mut = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      if (needsBank && !bankAccountId) {
        throw new Error(
          accounts.length === 0
            ? "Add a collection account under Finance → Banking."
            : "Select the account this payment was made from"
        );
      }

      if (partyType === "supplier") {
        return paySupplierApi({
          supplierId: partyId,
          amount: amt,
          paymentMethod: method === "cheque" ? "cheque" : method,
          paymentDate,
          bankAccountId: bankAccountId || undefined,
          referenceNo: referenceNo || undefined,
          billId,
        });
      }

      const allocations = Object.entries(selected)
        .filter(([, v]) => v && Number(v) > 0)
        .map(([saleId, v]) => ({ saleId, amount: Number(v) }));

      return recordCustomerPaymentApi({
        customerId: partyId,
        amount: amt,
        paymentMethod:
          method === "cheque" ? "bank_transfer" : (method as "cash" | "mpesa" | "bank_transfer"),
        paymentDate,
        bankAccountId: bankAccountId || undefined,
        referenceNo: referenceNo || undefined,
        payAll: payAll || undefined,
        allocations: allocations.length > 0 ? allocations : undefined,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payment recorded");
        onOpenChange(false);
        onSuccess?.();
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Pay {partyType === "supplier" ? "supplier" : "customer"} —{" "}
            {partyName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Outstanding:{" "}
            <span className="font-money font-semibold text-warning">
              {formatTzs(maxAmount)}
            </span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                className="font-money"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment date</Label>
              <Input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as typeof method);
                setBankAccountId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                {partyType === "supplier" && (
                  <SelectItem value="cheque">Cheque</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {needsBank && (
            <div className="space-y-2">
              <Label>Collection / bank account</Label>
              <Select
                value={bankAccountId}
                onValueChange={(v) => setBankAccountId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="M-Pesa code, cheque no…"
            />
          </div>

          {partyType === "customer" && invoices.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Allocate to invoices</Label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={payAll}
                    onChange={(e) => {
                      setPayAll(e.target.checked);
                      if (e.target.checked) {
                        setAmount(String(invoiceTotal));
                      }
                    }}
                  />
                  Pay all open ({formatTzs(invoiceTotal)})
                </label>
              </div>
              {!payAll && (
                <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                  {invoices.map((inv) => (
                    <li
                      key={inv.saleId}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {inv.invoiceNo} · {inv.saleDate} ·{" "}
                        {formatTzs(inv.balanceDue)}
                      </span>
                      <Input
                        type="number"
                        className="h-8 w-28 font-money"
                        placeholder="Amt"
                        value={selected[inv.saleId] ?? ""}
                        onChange={(e) =>
                          setSelected((s) => ({
                            ...s,
                            [inv.saleId]: e.target.value,
                          }))
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Leave amounts blank to apply FIFO to oldest invoices.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!amount || mut.isPending || (needsBank && !bankAccountId)}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Record payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
