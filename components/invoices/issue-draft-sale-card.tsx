"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  needsPosPaymentAccount,
  PosPaymentAccountPicker,
} from "@/components/pos/pos-payment-account-picker";
import { PosPaymentChips, type PaymentMethod } from "@/components/pos/pos-payment-chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { issueDraftDocument } from "@/lib/actions/invoices";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  saleId: string;
  totalAmount: number;
  hasCustomer: boolean;
};

export function IssueDraftSaleCard({ saleId, totalAmount, hasCustomer }: Props) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState(String(totalAmount));
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const amount = Number(amountPaid) || 0;
  const balanceDue = Math.max(totalAmount - amount, 0);
  const needsCustomer = balanceDue > 0 && !hasCustomer;
  const needsAccount =
    needsPosPaymentAccount(paymentMethod) && !paymentAccountId.trim();

  const issueMut = useMutation({
    mutationFn: issueDraftDocument,
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(
        r.balanceDue > 0
          ? `Issued ${r.invoiceNo} as unpaid invoice`
          : `Issued ${r.invoiceNo} as paid invoice`
      );
      router.push(`/sales/${r.saleId}`);
      router.refresh();
    },
  });

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-base">Issue invoice and delivery note</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <PosPaymentChips value={paymentMethod} onChange={setPaymentMethod} />
        {needsPosPaymentAccount(paymentMethod) ? (
          <PosPaymentAccountPicker
            posMethod={paymentMethod}
            value={paymentAccountId}
            onChange={setPaymentAccountId}
          />
        ) : null}
        <div className="space-y-1">
          <Label>Amount received</Label>
          <Input
            type="number"
            min={0}
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            className="font-money"
          />
          <p className="text-xs text-muted-foreground">
            Invoice total {formatTzs(totalAmount)} | Balance after issue{" "}
            <span className="font-money">{formatTzs(balanceDue)}</span>
          </p>
        </div>
        {needsCustomer ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
            Select a customer on this quotation before issuing an unpaid invoice.
          </p>
        ) : null}
        {needsAccount ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs text-warning">
            Select a collection account for this payment method.
          </p>
        ) : null}
        <Button
          type="button"
          disabled={issueMut.isPending || needsCustomer || needsAccount}
          onClick={() =>
            issueMut.mutate({
              saleId,
              paymentMethod,
              amountPaid: amount,
              paymentAccountId: paymentAccountId || undefined,
            })
          }
        >
          {issueMut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Issue now (deduct stock)
        </Button>
      </CardContent>
    </Card>
  );
}

