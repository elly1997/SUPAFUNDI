"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import {
  needsPosPaymentAccount,
  PosPaymentAccountPicker,
} from "@/components/pos/pos-payment-account-picker";
import { PosPaymentChips, type PaymentMethod } from "@/components/pos/pos-payment-chips";
import { fetchPosCustomers, type PosCustomer } from "@/lib/api/customers-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

const QUICK_PAY_INCREMENTS = [1000, 5000, 10000] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (m: PaymentMethod) => void;
  amountPaid: string;
  onAmountPaidChange: (v: string) => void;
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  mpesaPhone: string;
  onMpesaPhoneChange: (v: string) => void;
  cashChange: number;
  onBumpAmountPaid: (delta: number) => void;
  onSetExactAmount: () => void;
  onComplete: () => void;
  isPending: boolean;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
  paymentAccountId?: string;
  onPaymentAccountIdChange?: (id: string) => void;
};

export function PosCheckoutDialog({
  open,
  onOpenChange,
  total,
  paymentMethod,
  onPaymentMethodChange,
  amountPaid,
  onAmountPaidChange,
  customerId,
  onCustomerIdChange,
  mpesaPhone,
  onMpesaPhoneChange,
  cashChange,
  onBumpAmountPaid,
  onSetExactAmount,
  onComplete,
  isPending,
  onCustomerSelect,
  paymentAccountId = "",
  onPaymentAccountIdChange,
}: Props) {
  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: fetchPosCustomers,
    enabled: open,
  });

  const selected = customers.find((c) => c.id === customerId) ?? null;
  const paid = Number(amountPaid) || 0;
  const balanceAfterSale =
    selected && (paymentMethod === "credit_account" || paid < total)
      ? selected.outstanding_balance + Math.max(0, total - paid)
      : null;
  const creditExceeded =
    selected &&
    balanceAfterSale !== null &&
    selected.credit_limit > 0 &&
    balanceAfterSale > selected.credit_limit;
  const creditNoLimit =
    selected &&
    paymentMethod === "credit_account" &&
    selected.credit_limit === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="text-center sm:text-left">
          <DialogTitle className="text-lg">Complete sale</DialogTitle>
        </DialogHeader>

        <div className="rounded-2xl bg-primary/10 px-4 py-5 text-center">
          <p className="text-sm font-medium text-muted-foreground">Amount due</p>
          <p className="mt-1 font-money text-4xl font-bold tabular-nums tracking-tight text-primary">
            {formatTzs(total)}
          </p>
        </div>

        {(creditExceeded || creditNoLimit) && (
          <div
            className={cn(
              "rounded-xl border px-4 py-3 text-sm",
              creditExceeded
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-warning/40 bg-warning/10 text-warning"
            )}
          >
            {creditExceeded ? (
              <>
                <strong>Credit limit exceeded.</strong>{" "}
                {selected?.name} limit {formatTzs(selected!.credit_limit)} ·
                balance after sale {formatTzs(balanceAfterSale!)}
              </>
            ) : (
              <>
                <strong>No credit limit</strong> set for {selected?.name}.
                Choose another payment or update the customer profile.
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Payment method
          </Label>
          <PosPaymentChips
            value={paymentMethod}
            onChange={onPaymentMethodChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pos-amount-paid" className="font-medium">
            Amount paid
          </Label>
          <Input
            id="pos-amount-paid"
            type="number"
            min={0}
            inputMode="decimal"
            className="h-14 rounded-xl text-center text-2xl font-bold tabular-nums"
            value={amountPaid}
            onChange={(e) => onAmountPaidChange(e.target.value)}
          />
          {paymentMethod === "cash" && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-11 flex-1 rounded-xl font-semibold"
                  onClick={onSetExactAmount}
                >
                  Exact
                </Button>
                {QUICK_PAY_INCREMENTS.map((inc) => (
                  <Button
                    key={inc}
                    type="button"
                    variant="outline"
                    className="h-11 min-w-[4rem] rounded-xl font-semibold"
                    onClick={() => onBumpAmountPaid(inc)}
                  >
                    +{inc / 1000}k
                  </Button>
                ))}
              </div>
              {cashChange > 0 && (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl px-4 py-3",
                    "bg-inflow-muted text-inflow"
                  )}
                >
                  <span className="font-medium">Change</span>
                  <span className="text-xl font-bold tabular-nums">
                    {formatTzs(cashChange)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {needsPosPaymentAccount(paymentMethod) && onPaymentAccountIdChange && (
          <PosPaymentAccountPicker
            posMethod={paymentMethod}
            value={paymentAccountId}
            onChange={onPaymentAccountIdChange}
          />
        )}

        {paymentMethod === "mpesa" && (
          <div className="space-y-2">
            <Label htmlFor="pos-mpesa-phone">M-Pesa phone (STK after sale)</Label>
            <Input
              id="pos-mpesa-phone"
              placeholder="07xxxxxxxx"
              className="h-11 rounded-xl"
              value={mpesaPhone}
              onChange={(e) => onMpesaPhoneChange(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Customer</Label>
          <Select
            value={customerId || "__none__"}
            onValueChange={(v) => {
              const id = !v || v === "__none__" ? "" : v;
              onCustomerIdChange(id);
              const c = customers.find((x) => x.id === id) ?? null;
              onCustomerSelect?.(c);
            }}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="Walk-in customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Walk-in (no customer)</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.outstanding_balance > 0
                    ? ` · owed ${formatTzs(c.outstanding_balance)}`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="h-12 w-full rounded-xl text-base font-semibold"
            disabled={isPending || !!creditExceeded || !!creditNoLimit}
            onClick={onComplete}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Processing…
              </>
            ) : (
              "Complete sale"
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
