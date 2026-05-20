"use client";

import { Loader2, Printer } from "lucide-react";
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
  onIssueReceipt: () => void;
  onComplete: () => void;
  receiptIssued: boolean;
  needsCustomer: boolean;
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
  onIssueReceipt,
  onComplete,
  receiptIssued,
  needsCustomer,
  disabled,
  isPending,
}: Props) {
  return (
    <div className="space-y-2 border-t border-border/60 pt-2">
      <PosPaymentChips value={paymentMethod} onChange={onPaymentMethodChange} />
      {needsCustomer && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Partial payment or on-account sale — select a registered customer above
          (not walk-in).
        </p>
      )}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Amount paid</Label>
        <Input
          type="number"
          min={0}
          className="h-9 rounded-lg bg-surface-1 text-center font-money text-base font-bold text-foreground"
          value={amountPaid}
          onChange={(e) => onAmountPaidChange(e.target.value)}
        />
        {paymentMethod === "cash" && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1 rounded-lg"
              onClick={onSetExact}
            >
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
        variant="secondary"
        className="h-9 w-full rounded-lg text-sm font-semibold"
        disabled={disabled}
        onClick={onIssueReceipt}
      >
        <Printer className="mr-2 size-4" />
        {receiptIssued ? "Review receipt again" : "Issue receipt"}
      </Button>
      <Button
        type="button"
        className="h-10 w-full rounded-lg text-sm font-semibold shadow-md shadow-primary/20"
        disabled={disabled || !receiptIssued || isPending || needsCustomer}
        onClick={onComplete}
      >
        {isPending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          `Complete sale · ${formatTzs(total)}`
        )}
      </Button>
      {!receiptIssued && !disabled && (
        <p className="text-center text-xs text-muted-foreground">
          Issue and check the receipt before completing
        </p>
      )}
    </div>
  );
}
