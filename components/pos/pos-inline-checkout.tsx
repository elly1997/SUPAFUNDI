"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  needsPosPaymentAccount,
  PosPaymentAccountPicker,
} from "@/components/pos/pos-payment-account-picker";
import { PosPaymentChips, type PaymentMethod } from "@/components/pos/pos-payment-chips";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  amountPaid: string;
  onAmountPaidChange: (v: string) => void;
  onComplete: () => void;
  needsCustomer: boolean;
  needsPaymentAccount: boolean;
  showAmountPaid: boolean;
  disabled: boolean;
  isPending: boolean;
  paymentAccountId?: string;
  onPaymentAccountIdChange?: (id: string) => void;
  compact?: boolean;
};

export function PosInlineCheckout({
  total,
  paymentMethod,
  onPaymentMethodChange,
  amountPaid,
  onAmountPaidChange,
  onComplete,
  needsCustomer,
  needsPaymentAccount,
  showAmountPaid,
  disabled,
  isPending,
  paymentAccountId = "",
  onPaymentAccountIdChange,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        "border-t border-border/60 pt-2",
        compact ? "space-y-1.5" : "space-y-2"
      )}
    >
      <PosPaymentChips
        value={paymentMethod}
        onChange={onPaymentMethodChange}
        compact={compact}
      />
      {needsPosPaymentAccount(paymentMethod) && onPaymentAccountIdChange && (
        <PosPaymentAccountPicker
          posMethod={paymentMethod}
          value={paymentAccountId}
          onChange={onPaymentAccountIdChange}
        />
      )}
      {needsCustomer && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
          Select a registered customer for partial or on-account payment.
        </p>
      )}
      {needsPaymentAccount && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-warning">
          Select a collection account before completing this payment.
        </p>
      )}
      {showAmountPaid && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Amount paid</Label>
          <Input
            type="number"
            min={0}
            className={cn(
              "rounded-lg bg-surface-1 text-right font-money text-sm text-foreground",
              compact ? "min-h-9" : "min-h-11"
            )}
            value={amountPaid}
            onChange={(e) => onAmountPaidChange(e.target.value)}
          />
        </div>
      )}
      <Button
        type="button"
        className={cn(
          "w-full rounded-xl font-semibold shadow-md shadow-primary/20",
          compact ? "h-10 text-xs" : "h-11 text-sm"
        )}
        disabled={disabled || isPending || needsCustomer || needsPaymentAccount}
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
