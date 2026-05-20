"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PosPaymentChips, type PaymentMethod } from "@/components/pos/pos-payment-chips";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  amountPaid: string;
  onAmountPaidChange: (v: string) => void;
  onComplete: () => void;
  needsCustomer: boolean;
  showAmountPaid: boolean;
  disabled: boolean;
  isPending: boolean;
};

export function PosInlineCheckout({
  total,
  paymentMethod,
  onPaymentMethodChange,
  amountPaid,
  onAmountPaidChange,
  onComplete,
  needsCustomer,
  showAmountPaid,
  disabled,
  isPending,
}: Props) {
  return (
    <div className="space-y-2 border-t border-border/60 pt-2">
      <PosPaymentChips value={paymentMethod} onChange={onPaymentMethodChange} />
      {needsCustomer && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
          Select a registered customer for partial or on-account payment.
        </p>
      )}
      {showAmountPaid && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Amount paid</Label>
          <Input
            type="number"
            min={0}
            className="h-9 rounded-lg bg-surface-1 text-right font-money text-sm text-foreground"
            value={amountPaid}
            onChange={(e) => onAmountPaidChange(e.target.value)}
          />
        </div>
      )}
      <Button
        type="button"
        className="h-11 w-full rounded-xl text-sm font-semibold shadow-md shadow-primary/20"
        disabled={disabled || isPending || needsCustomer}
        onClick={onComplete}
      >
        {isPending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          `Complete sale · ${formatTzs(total)}`
        )}
      </Button>
    </div>
  );
}
