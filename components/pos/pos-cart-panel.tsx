"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { PosCartCustomer } from "@/components/pos/pos-cart-customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { maxSellFromCartFields } from "@/lib/products/units";
import { formatTzs } from "@/lib/utils/currency";
import { PosInlineCheckout } from "@/components/pos/pos-inline-checkout";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import type { PosCustomer } from "@/lib/api/customers-fetch";
import type { AddProductResult, CartLine } from "@/stores/cartStore";

type Props = {
  lines: CartLine[];
  subtotal: number;
  taxAmount: number;
  calculatedTotal: number;
  chargeTotal: string;
  onChargeTotalChange: (v: string) => void;
  onChargeTotalLock?: () => void;
  taxRate: number;
  onUpdateQuantity: (lineKey: string, qty: number) => AddProductResult;
  onRemoveLine: (lineKey: string) => void;
  onCheckout: () => void;
  onStockError: (result: AddProductResult) => void;
  className?: string;
  showCheckoutButton?: boolean;
  checkoutDisabled?: boolean;
  inlineCheckout?: boolean;
  paymentMethod?: PaymentMethod;
  onPaymentMethodChange?: (m: PaymentMethod) => void;
  amountPaid?: string;
  onAmountPaidChange?: (v: string) => void;
  onCompleteSale?: () => void;
  needsCustomer?: boolean;
  showAmountPaid?: boolean;
  isCheckoutPending?: boolean;
  customerId?: string;
  onCustomerIdChange?: (id: string) => void;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
  paymentAccountId?: string;
  onPaymentAccountIdChange?: (id: string) => void;
};

export function PosCartPanel({
  lines,
  subtotal,
  taxAmount,
  calculatedTotal,
  chargeTotal,
  onChargeTotalChange,
  onChargeTotalLock,
  taxRate,
  onUpdateQuantity,
  onRemoveLine,
  onCheckout,
  onStockError,
  className,
  showCheckoutButton = true,
  checkoutDisabled = false,
  inlineCheckout = false,
  paymentMethod = "cash",
  onPaymentMethodChange,
  amountPaid = "",
  onAmountPaidChange,
  onCompleteSale,
  needsCustomer = false,
  showAmountPaid = false,
  isCheckoutPending = false,
  customerId = "",
  onCustomerIdChange,
  onCustomerSelect,
  paymentAccountId = "",
  onPaymentAccountIdChange,
}: Props) {
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const chargeAmount = Number(chargeTotal);
  const effectiveTotal =
    chargeTotal.trim() && Number.isFinite(chargeAmount) && chargeAmount >= 0
      ? Math.round(chargeAmount)
      : Math.round(calculatedTotal);
  const adjustment = Math.round(calculatedTotal - effectiveTotal);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-[14rem] flex-col bg-card/40",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-header/60 px-4 py-3">
        <ShoppingBag className="size-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">
          Cart
          <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
            {itemCount}
          </span>
        </h2>
      </div>

      <div className="pos-scroll-area min-h-0 flex-1 px-3 py-3">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingBag className="mb-2 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Cart is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap a product to add it
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const lineTotal =
                line.quantity *
                line.unitPrice *
                (1 - line.discountPct / 100);
              return (
                <li
                  key={line.lineKey}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {line.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatTzs(line.unitPrice)} / {line.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.lineKey)}
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive touch-manipulation"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.lineKey,
                            line.quantity - 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-[2rem] text-center text-sm font-bold tabular-nums text-foreground">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        disabled={
                          line.quantity >=
                          maxSellFromCartFields(
                            line.availableStock,
                            line.factorToBase,
                            line.unitsPerBase
                          )
                        }
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.lineKey,
                            line.quantity + 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <span className="font-money text-sm font-bold tabular-nums text-foreground">
                      {formatTzs(lineTotal)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-card/95 p-4">
        {inlineCheckout && onCustomerIdChange && (
          <PosCartCustomer
            customerId={customerId}
            onCustomerIdChange={onCustomerIdChange}
            onCustomerSelect={onCustomerSelect}
          />
        )}

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-money tabular-nums text-foreground">
            {formatTzs(subtotal)}
          </span>
        </div>
        {taxRate > 0 && taxAmount > 0 ? (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Calculated total</span>
            <span className="tabular-nums text-muted-foreground">
              {formatTzs(calculatedTotal)}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-sm">
          <Label htmlFor="pos-charge-total" className="text-muted-foreground">
            Amount to charge (TZS)
          </Label>
          <Input
            id="pos-charge-total"
            type="number"
            min={0}
            className="min-h-11 w-36 text-right tabular-nums text-foreground"
            value={chargeTotal}
            onChange={(e) => {
              onChargeTotalLock?.();
              onChargeTotalChange(e.target.value);
            }}
          />
        </div>
        {adjustment !== 0 && (
          <p className="form-hint text-right">
            {adjustment > 0
              ? `Discount ${formatTzs(adjustment)} vs calculated`
              : `Overcharge ${formatTzs(-adjustment)} vs calculated`}
          </p>
        )}
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm text-muted-foreground">Charge</span>
          <span className="font-money text-xl font-bold tabular-nums text-primary">
            {formatTzs(effectiveTotal)}
          </span>
        </div>

        {inlineCheckout &&
        onPaymentMethodChange &&
        onAmountPaidChange &&
        onCompleteSale ? (
          <PosInlineCheckout
            total={effectiveTotal}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={onPaymentMethodChange}
            amountPaid={amountPaid}
            onAmountPaidChange={onAmountPaidChange}
            onComplete={onCompleteSale}
            needsCustomer={needsCustomer}
            showAmountPaid={showAmountPaid}
            disabled={lines.length === 0 || checkoutDisabled}
            isPending={isCheckoutPending}
            paymentAccountId={paymentAccountId}
            onPaymentAccountIdChange={onPaymentAccountIdChange}
          />
        ) : showCheckoutButton ? (
          <Button
            className="mt-1 h-11 w-full rounded-xl font-semibold"
            disabled={lines.length === 0 || checkoutDisabled}
            onClick={onCheckout}
          >
            Pay {lines.length > 0 ? formatTzs(effectiveTotal) : ""}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
