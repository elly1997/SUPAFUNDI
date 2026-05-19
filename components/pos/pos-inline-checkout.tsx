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
  cashChange: number;
  onSetExact: () => void;
  onComplete: () => void;
  disabled: boolean;
  isPending: boolean;
};

export function PosInlineCheckout({
  total,
  paymentMethod,
  onPaymentMethodChange,
  amountPaid,
  onAmountPaidChange,
  cashChange,
  onSetExact,
  onComplete,
  disabled,
  isPending,
}: Props) {
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <PosPaymentChips value={paymentMethod} onChange={onPaymentMethodChange} />
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Amount paid</Label>
        <Input
          type="number"
          min={0}
          className="h-11 rounded-xl text-center font-money text-lg font-bold"
          value={amountPaid}
          onChange={(e) => onAmountPaidChange(e.target.value)}
        />
        {paymentMethod === "cash" && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" className="flex-1 rounded-lg" onClick={onSetExact}>
              Exact
            </Button>
            {cashChange > 0 && (
              <span className="flex flex-1 items-center justify-center text-xs font-medium text-inflow">
                Change {formatTzs(cashChange)}
              </span>
            )}
          </div>
        )}
      </div>
      <Button
        type="button"
        className="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/25"
        disabled={disabled || isPending}
        onClick={onComplete}
      >
        {isPending ? <Loader2 className="size-5 animate-spin" /> : `Complete · ${formatTzs(total)}`}
      </Button>
    </div>
  );
}
