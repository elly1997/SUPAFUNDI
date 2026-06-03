"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { PosCartCustomer } from "@/components/pos/pos-cart-customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  adjustSellQty,
  formatSellQty,
  maxSellFromCartFields,
} from "@/lib/products/units";
import { computeLineTotal } from "@/lib/utils/calculations";
import { formatTzs } from "@/lib/utils/currency";
import { PosCartMargin } from "@/components/pos/pos-cart-margin";
import { PosInlineCheckout } from "@/components/pos/pos-inline-checkout";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import type { PosCustomer } from "@/lib/api/customers-fetch";
import type { AddProductResult, CartLine } from "@/stores/cartStore";
import type { CartMarginSummary } from "@/lib/utils/cart-margin";

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
  needsPaymentAccount?: boolean;
  showAmountPaid?: boolean;
  isCheckoutPending?: boolean;
  customerId?: string;
  onCustomerIdChange?: (id: string) => void;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
  paymentAccountId?: string;
  onPaymentAccountIdChange?: (id: string) => void;
  margin?: CartMarginSummary | null;
  listMargin?: CartMarginSummary | null;
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
  needsPaymentAccount = false,
  showAmountPaid = false,
  isCheckoutPending = false,
  customerId = "",
  onCustomerIdChange,
  onCustomerSelect,
  paymentAccountId = "",
  onPaymentAccountIdChange,
  margin = null,
  listMargin = null,
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
        "pos-cart-panel flex h-full min-h-0 w-full min-w-[14rem] flex-col bg-card/40",
        className
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-header/60 px-3 py-2">
        <ShoppingBag className="size-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Cart
          <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            {itemCount}
          </span>
        </h2>
      </div>

      <div className="pos-scroll-area min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShoppingBag className="mb-2 size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Cart is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap a product to add it
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {lines.map((line) => {
              const lineTotal = computeLineTotal(
                line.quantity,
                line.unitPrice,
                line.discountPct
              );
              const maxQty = maxSellFromCartFields(
                line.availableStock,
                line.factorToBase,
                line.unitsPerBase
              );
              return (
                <li
                  key={line.lineKey}
                  className="flex items-center gap-1.5 py-2 first:pt-1"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-xs font-semibold leading-tight text-foreground"
                      title={line.name}
                    >
                      {line.name}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-muted-foreground">
                      {formatTzs(line.unitPrice)} / {line.unit}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-md touch-manipulation lg:size-7"
                      onClick={() => {
                        const next = adjustSellQty(line.quantity, -1);
                        const r = onUpdateQuantity(line.lineKey, next);
                        if (!r.ok) onStockError(r);
                      }}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span
                      className="min-w-[2rem] text-center text-xs font-bold tabular-nums text-foreground"
                      title="Tap product to enter exact qty (e.g. 0.5)"
                    >
                      {formatSellQty(line.quantity)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-md touch-manipulation lg:size-7"
                      disabled={line.quantity >= maxQty}
                      onClick={() => {
                        const next = adjustSellQty(line.quantity, 1);
                        const r = onUpdateQuantity(line.lineKey, next);
                        if (!r.ok) onStockError(r);
                      }}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <span
                    className="w-[4.25rem] shrink-0 text-right font-money text-xs font-bold tabular-nums leading-tight text-foreground"
                    title={formatTzs(lineTotal)}
                  >
                    {formatTzs(lineTotal)}
                  </span>

                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.lineKey)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive touch-manipulation lg:size-7"
                    aria-label={`Remove ${line.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pos-cart-footer shrink-0 space-y-1.5 border-t border-border bg-card/95 p-2.5">
        {inlineCheckout && onCustomerIdChange && (
          <PosCartCustomer
            customerId={customerId}
            onCustomerIdChange={onCustomerIdChange}
            onCustomerSelect={onCustomerSelect}
          />
        )}

        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-money tabular-nums text-foreground">
            {formatTzs(subtotal)}
          </span>
        </div>
        {taxRate > 0 && taxAmount > 0 ? (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Calculated total</span>
            <span className="tabular-nums text-muted-foreground">
              {formatTzs(calculatedTotal)}
            </span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-xs">
          <Label
            htmlFor="pos-charge-total"
            className="shrink-0 text-muted-foreground"
          >
            Charge (TZS)
          </Label>
          <Input
            id="pos-charge-total"
            type="number"
            min={0}
            className="h-9 w-28 text-right text-xs tabular-nums text-foreground"
            value={chargeTotal}
            onChange={(e) => {
              onChargeTotalLock?.();
              onChargeTotalChange(e.target.value);
            }}
          />
        </div>
        {adjustment !== 0 && (
          <p className="form-hint text-right text-[10px]">
            {adjustment > 0
              ? `Discount ${formatTzs(adjustment)} vs calculated`
              : `Overcharge ${formatTzs(-adjustment)} vs calculated`}
          </p>
        )}

        {margin ? (
          <PosCartMargin
            margin={margin}
            listMargin={listMargin}
            showListComparison={adjustment !== 0}
          />
        ) : lines.length > 0 ? (
          <p className="form-hint text-[10px] leading-snug">
            Set buying prices in inventory to see estimated margin.
          </p>
        ) : null}

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-muted-foreground">Charge</span>
          <span className="font-money text-lg font-bold tabular-nums text-primary">
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
            needsPaymentAccount={needsPaymentAccount}
            showAmountPaid={showAmountPaid}
            disabled={lines.length === 0 || checkoutDisabled}
            isPending={isCheckoutPending}
            paymentAccountId={paymentAccountId}
            onPaymentAccountIdChange={onPaymentAccountIdChange}
            compact
          />
        ) : showCheckoutButton ? (
          <Button
            className="mt-0.5 h-10 w-full rounded-xl text-sm font-semibold"
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
