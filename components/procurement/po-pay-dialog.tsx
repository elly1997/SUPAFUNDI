"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { CollectionAccountSelect } from "@/components/finance/collection-account-select";
import { needsCollectionAccount } from "@/lib/finance/collection-accounts";
import { payPurchaseOrderApi } from "@/lib/api/daily-ops-fetch";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  poId: string;
  referenceNo: string | null;
  supplierName: string | null;
  totalAmount: number;
  balance?: number | null;
  onPaid?: () => void;
};

export function PoPayDialog({
  open,
  onOpenChange,
  poId,
  referenceNo,
  supplierName,
  totalAmount,
  balance,
  onPaid,
}: Props) {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "mpesa" | "bank_transfer" | "cheque"
  >("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(businessDate);
  const [amount, setAmount] = useState(String(balance ?? totalAmount));
  const [paymentRef, setPaymentRef] = useState("");

  useEffect(() => {
    if (!open) return;
    setPaymentDate(businessDate);
    setAmount(String(balance ?? totalAmount));
    setPaymentRef("");
    setPaymentMethod("cash");
    setBankAccountId("");
  }, [open, businessDate, balance, totalAmount]);

  const payMut = useMutation({
    mutationFn: () =>
      payPurchaseOrderApi({
        poId,
        paymentMethod,
        paymentDate,
        amount: Number(amount),
        referenceNo: paymentRef.trim() || undefined,
        bankAccountId: bankAccountId || undefined,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Purchase order marked paid");
        onOpenChange(false);
        onPaid?.();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Payment failed"),
  });

  const needsAccount = needsCollectionAccount(paymentMethod);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay purchase order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {referenceNo ?? "PO"} · {supplierName ?? "Supplier"} · balance{" "}
            <span className="font-money font-semibold text-warning">
              {formatTzs(balance ?? totalAmount)}
            </span>
          </p>
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
              className="font-money"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(
                  (v ?? "cash") as "cash" | "mpesa" | "bank_transfer" | "cheque"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CollectionAccountSelect
            paymentMethod={paymentMethod}
            value={bankAccountId}
            onValueChange={setBankAccountId}
            label="Pay from account"
          />
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="M-Pesa code, cheque no., etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              payMut.isPending ||
              !amount ||
              (needsAccount && !bankAccountId)
            }
            onClick={() => payMut.mutate()}
          >
            {payMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
