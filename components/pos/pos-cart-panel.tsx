"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { PosCartCustomer } from "@/components/pos/pos-cart-customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { PosInlineCheckout } from "@/components/pos/pos-inline-checkout";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import type { PosCustomer } from "@/lib/actions/sales";
import type { AddProductResult, CartLine } from "@/stores/cartStore";

type Props = {
  lines: CartLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  cartDiscount: number;
  onCartDiscountChange: (n: number) => void;
  onUpdateQuantity: (productId: string, qty: number) => AddProductResult;
  onRemoveLine: (productId: string) => void;
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
  cashChange?: number;
  onSetExactAmount?: () => void;
  onIssueReceipt?: () => void;
  onCompleteSale?: () => void;
  receiptIssued?: boolean;
  needsCustomer?: boolean;
  isCheckoutPending?: boolean;
  customerId?: string;
  onCustomerIdChange?: (id: string) => void;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
};

export function PosCartPanel({
  lines,
  subtotal,
  discountAmount,
  taxAmount,
  total,
  taxRate,
  cartDiscount,
  onCartDiscountChange,
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
  cashChange = 0,
  onSetExactAmount,
  onIssueReceipt,
  onCompleteSale,
  receiptIssued = false,
  needsCustomer = false,
  isCheckoutPending = false,
  customerId = "",
  onCustomerIdChange,
  onCustomerSelect,
}: Props) {
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div
      className={cn(
        "pos-cart-panel grid h-full min-h-0 w-full grid-rows-[auto_minmax(8rem,1fr)_auto_auto] overflow-hidden bg-card/50",
        className
      )}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-header/80 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ShoppingBag className="size-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Cart</h2>
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">
            {itemCount}
          </span>
        </div>
        {lines.length > 0 && (
          <span className="font-money text-sm font-bold text-primary tabular-nums">
            {formatTzs(total)}
          </span>
        )}
      </div>

      {/* Line items — primary scroll region */}
      <div className="pos-scroll-area min-h-[8rem] border-b border-border/60 px-2 py-2">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center px-4 text-center">
            <ShoppingBag className="mb-2 size-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No items yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tap products to add them here
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line) => {
              const lineTotal =
                line.quantity *
                line.unitPrice *
                (1 - line.discountPct / 100);
              return (
                <li
                  key={line.productId}
                  className="rounded-xl border border-border/80 bg-card px-2.5 py-2"
                >
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">
                        {line.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatTzs(line.unitPrice)} × {line.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.productId)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/15 hover:text-destructive touch-manipulation"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-lg border border-border bg-muted/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-l-lg"
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.productId,
                            line.quantity - 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="min-w-[2.25rem] text-center text-sm font-bold tabular-nums text-foreground">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-r-lg"
                        disabled={line.quantity >= line.availableStock}
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.productId,
                            line.quantity + 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Plus className="size-3.5" />
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

      {/* Customer — compact, below items */}
      {inlineCheckout && onCustomerIdChange && (
        <div className="shrink-0 space-y-1 border-b border-border/60 px-3 py-2">
          <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customer
          </Label>
          <PosCartCustomer
            customerId={customerId}
            onCustomerIdChange={onCustomerIdChange}
            onCustomerSelect={onCustomerSelect}
          />
        </div>
      )}

      {/* Totals + checkout — shrink only, scroll inside panel above */}
      <div className="pos-cart-footer shrink-0 space-y-2 overflow-y-auto border-t border-border bg-card/95 px-3 py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="text-right font-money tabular-nums text-foreground">
            {formatTzs(subtotal)}
          </span>
          <span className="text-muted-foreground">VAT {taxRate}%</span>
          <span className="text-right tabular-nums text-foreground">
            {formatTzs(taxAmount)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="pos-cart-discount"
            className="shrink-0 text-xs text-muted-foreground"
          >
            Discount
          </Label>
          <Input
            id="pos-cart-discount"
            type="number"
            min={0}
            className="h-8 flex-1 rounded-lg bg-surface-1 text-right text-sm tabular-nums text-foreground"
            value={cartDiscount || ""}
            onChange={(e) =>
              onCartDiscountChange(Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-xs text-outflow">
            <span>Applied</span>
            <span className="tabular-nums">-{formatTzs(discountAmount)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-border/60 pt-2">
          <span className="text-xs font-medium text-muted-foreground">Total</span>
          <span className="font-money text-xl font-bold tabular-nums text-primary">
            {formatTzs(total)}
          </span>
        </div>
        {inlineCheckout &&
        onPaymentMethodChange &&
        onAmountPaidChange &&
        onCompleteSale &&
        onIssueReceipt ? (
          <PosInlineCheckout
            total={total}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={onPaymentMethodChange}
            amountPaid={amountPaid}
            onAmountPaidChange={onAmountPaidChange}
            cashChange={cashChange}
            onSetExact={onSetExactAmount ?? (() => {})}
            onIssueReceipt={onIssueReceipt}
            onComplete={onCompleteSale}
            receiptIssued={receiptIssued}
            needsCustomer={needsCustomer}
            disabled={lines.length === 0 || checkoutDisabled}
            isPending={isCheckoutPending}
          />
        ) : showCheckoutButton ? (
          <Button
            className="h-11 w-full rounded-xl text-sm font-semibold"
            disabled={lines.length === 0 || checkoutDisabled}
            onClick={onCheckout}
          >
            Pay {lines.length > 0 ? formatTzs(total) : ""}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
