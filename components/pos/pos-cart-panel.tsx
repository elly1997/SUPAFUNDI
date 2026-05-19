"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { PosInlineCheckout } from "@/components/pos/pos-inline-checkout";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
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
  onCompleteSale?: () => void;
  isCheckoutPending?: boolean;
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
  onCompleteSale,
  isCheckoutPending = false,
}: Props) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-card/40", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-header/60 px-4 py-3">
        <ShoppingBag className="size-5 text-primary" />
        <h2 className="text-base font-semibold">
          Cart
          <span className="ml-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
            {lines.length}
          </span>
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex size-16 items-center justify-center rounded-2xl bg-muted">
              <ShoppingBag className="size-8 text-muted-foreground/60" />
            </div>
            <p className="font-medium text-foreground">Cart is empty</p>
            <p className="mt-1 max-w-[200px] text-sm text-muted-foreground">
              Tap a product to add it to this sale
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
                  key={line.productId}
                  className="rounded-2xl border bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {line.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTzs(line.unitPrice)} / {line.unit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.productId)}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive touch-manipulation"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-xl bg-muted/80 p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-lg"
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.productId,
                            line.quantity - 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="min-w-[2rem] text-center text-base font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 rounded-lg"
                        disabled={line.quantity >= line.availableStock}
                        onClick={() => {
                          const r = onUpdateQuantity(
                            line.productId,
                            line.quantity + 1
                          );
                          if (!r.ok) onStockError(r);
                        }}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <span className="font-money text-base font-bold tabular-nums">
                      {formatTzs(lineTotal)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t bg-card/95 p-4 backdrop-blur-sm">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-money tabular-nums">{formatTzs(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <Label htmlFor="pos-cart-discount" className="text-muted-foreground">
            Discount (TZS)
          </Label>
          <Input
            id="pos-cart-discount"
            type="number"
            min={0}
            className="h-10 w-28 rounded-xl text-right tabular-nums"
            value={cartDiscount || ""}
            onChange={(e) =>
              onCartDiscountChange(Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm text-outflow">
            <span>Discount</span>
            <span className="tabular-nums">-{formatTzs(discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">VAT ({taxRate}%)</span>
          <span className="tabular-nums">{formatTzs(taxAmount)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="font-money text-2xl font-bold tabular-nums tracking-tight text-primary">
            {formatTzs(total)}
          </span>
        </div>
        {inlineCheckout && onPaymentMethodChange && onAmountPaidChange && onCompleteSale ? (
          <PosInlineCheckout
            total={total}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={onPaymentMethodChange}
            amountPaid={amountPaid}
            onAmountPaidChange={onAmountPaidChange}
            cashChange={cashChange}
            onSetExact={onSetExactAmount ?? (() => {})}
            onComplete={onCompleteSale}
            disabled={lines.length === 0 || checkoutDisabled}
            isPending={isCheckoutPending}
          />
        ) : showCheckoutButton ? (
          <Button
            className="mt-2 h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-primary/20"
            size="lg"
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
