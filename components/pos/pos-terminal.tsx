"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PosCartPanel } from "@/components/pos/pos-cart-panel";
import { PosCategoryChips } from "@/components/pos/pos-category-chips";
import { PosCheckoutDialog } from "@/components/pos/pos-checkout-dialog";
import {
  PosReceiptPreviewDialog,
  type ReceiptPreviewLine,
} from "@/components/pos/pos-receipt-preview-dialog";
import { PosFavoritesRow } from "@/components/pos/pos-favorites-row";
import { PosCashflowPanel } from "@/components/pos/pos-cashflow-panel";
import { PosHeader, type PosOutletOption } from "@/components/pos/pos-header";
import { PosProductCard } from "@/components/pos/pos-product-card";
import { PosQuantityDialog } from "@/components/pos/pos-quantity-dialog";
import { printPosReceipt } from "@/components/pos/pos-receipt-print";
import { PosSessionGate } from "@/components/pos/pos-session-gate";
import { PosWholesaleBanner } from "@/components/pos/pos-wholesale-banner";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCart } from "@/hooks/useCart";
import { usePersistedCart } from "@/hooks/usePersistedCart";
import {
  usePosProducts,
  type PosPricingMode,
  type PosProductRow,
} from "@/hooks/usePosProducts";
import {
  completeSale,
  type CompleteSaleInput,
  type PosCustomer,
} from "@/lib/actions/sales";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";
import type { AddProductResult, CartLine } from "@/stores/cartStore";

type ReceiptState = {
  invoiceNo: string;
  totalAmount: number;
  changeGiven: number;
  balanceDue: number;
  saleId: string;
  paymentMethod: PaymentMethod;
  customerName: string;
  lines: { name: string; quantity: number; unitPrice: number }[];
};

function cartLineTotal(line: CartLine): number {
  return Math.round(
    line.quantity * line.unitPrice * (1 - line.discountPct / 100)
  );
}

function stockToast(result: AddProductResult) {
  if (result.ok) return;
  if (result.reason === "out_of_stock") {
    toast.error("Out of stock");
  } else {
    toast.error(`Only ${result.available} in stock`);
  }
}

type PosTerminalProps = {
  outlets: PosOutletOption[];
};

export function PosTerminal({ outlets }: PosTerminalProps) {
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const session = useAuthStore((s) => s.session);
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [taxRate] = useState(18);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [cashflowSheetOpen, setCashflowSheetOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [receiptIssued, setReceiptIssued] = useState(false);
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkPending, setStkPending] = useState(false);
  const [pricingMode, setPricingMode] = useState<PosPricingMode>("retail");
  const [sessionOverride, setSessionOverride] = useState(false);
  const [qtyProduct, setQtyProduct] = useState<PosProductRow | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const pricingSyncRef = useRef<PosPricingMode>(pricingMode);

  useEffect(() => {
    if (!outlets.length) return;
    const resolved = resolveActiveOutletId(outlets, {
      stored: activeOutletId,
      profileOutletId: session?.outletId,
    });
    if (resolved && resolved !== activeOutletId) {
      setActiveOutletId(resolved);
    }
  }, [activeOutletId, outlets, session?.outletId, setActiveOutletId]);

  const effectiveOutletId = resolveActiveOutletId(outlets, {
    stored: activeOutletId,
    profileOutletId: session?.outletId,
  });

  const { clearPersisted } = usePersistedCart(effectiveOutletId);

  const {
    lines,
    addProduct,
    updateQuantity,
    removeLine,
    clear,
    syncLinePrices,
    subtotal,
    discountAmount,
    taxAmount,
    total,
  } = useCart(taxRate, cartDiscount);

  const {
    data: products = [],
    isLoading: productsLoading,
    isFetching: productsFetching,
    refetch: refetchProducts,
  } = usePosProducts(effectiveOutletId, pricingMode);

  useEffect(() => {
    if (pricingSyncRef.current === pricingMode) return;
    pricingSyncRef.current = pricingMode;
    const map = new Map<
      string,
      { unitPrice: number; pricingMode: PosPricingMode }
    >();
    for (const p of products) {
      map.set(p.id, {
        unitPrice:
          pricingMode === "wholesale" ? p.wholesalePrice : p.retailPrice,
        pricingMode,
      });
    }
    const updated = syncLinePrices(map);
    if (updated > 0) {
      toast.message(`Updated ${updated} cart line price(s)`);
    }
  }, [pricingMode, products, syncLinePrices]);

  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      map.set(line.productId, line.quantity);
    }
    return map;
  }, [lines]);

  const itemCount = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
    [lines]
  );

  const filtered = useMemo(() => {
    let list = products;
    if (categoryId) {
      list = list.filter((p) => p.categoryId === categoryId);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code?.toLowerCase().includes(q) ?? false) ||
        (p.barcode?.toLowerCase().includes(q) ?? false)
    );
  }, [products, search, categoryId]);

  const paidAmount = Number(amountPaid) || 0;
  const cashChange =
    paymentMethod === "cash" && paidAmount > total
      ? Math.round(paidAmount - total)
      : 0;
  const balanceDuePreview = Math.max(0, Math.round(total - paidAmount));
  const needsCustomer =
    !customerId &&
    (paymentMethod === "credit_account" || balanceDuePreview > 0);

  const customerLabel = customerId
    ? (customerName ?? "Registered customer")
    : "Walk-in";

  const receiptPreviewLines: ReceiptPreviewLine[] = useMemo(
    () =>
      lines.map((l) => ({
        name: l.name,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: cartLineTotal(l),
      })),
    [lines]
  );

  useEffect(() => {
    setReceiptIssued(false);
  }, [lines, customerId, paymentMethod, total, cartDiscount, amountPaid]);

  useEffect(() => {
    if (lines.length > 0 && paymentMethod === "cash") {
      setAmountPaid((prev) => {
        const n = Number(prev);
        if (!prev || n === 0) return String(Math.round(total));
        return prev;
      });
    }
  }, [total, lines.length, paymentMethod]);

  const addFromProduct = useCallback(
    (p: PosProductRow, quantity = 1) => {
      const result = addProduct(
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          unitPrice: p.displayPrice,
          availableStock: p.stockQty,
          pricingMode,
        },
        quantity
      );
      if (result.ok) return true;
      stockToast(result);
      return false;
    },
    [addProduct, pricingMode]
  );

  const openQuantityFor = useCallback((p: PosProductRow) => {
    setQtyProduct(p);
    setQtyOpen(true);
  }, []);

  const tryAddFromSearch = useCallback(() => {
    const q = search.trim();
    if (!q) return;

    const lower = q.toLowerCase();
    let match =
      products.find((p) => p.barcode?.toLowerCase() === lower) ??
      products.find((p) => p.code?.toLowerCase() === lower);

    if (!match && filtered.length === 1) {
      match = filtered[0];
    }

    if (!match) {
      toast.error("No product found — check barcode or SKU");
      return;
    }

    if (addFromProduct(match, 1)) {
      setSearch("");
    }
  }, [search, products, filtered, addFromProduct]);

  const bumpAmountPaid = useCallback((delta: number) => {
    setAmountPaid((prev) => {
      const current = Number(prev) || 0;
      return String(Math.max(0, Math.round(current + delta)));
    });
  }, []);

  const handleCustomerSelect = useCallback((customer: PosCustomer | null) => {
    setCustomerName(customer?.name ?? null);
    if (customer?.price_type === "wholesale") {
      setPricingMode("wholesale");
      toast.message(`${customer.name} uses wholesale pricing`);
    }
  }, []);

  const checkout = useMutation({
    mutationFn: async () => {
      if (!effectiveOutletId) {
        throw new Error("Select an outlet before checkout.");
      }
      const paid = Number(amountPaid) || 0;
      const payload: CompleteSaleInput = {
        outletId: effectiveOutletId,
        customerId: customerId || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          productName: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
        })),
        cartDiscountAmount: cartDiscount,
        taxRate,
        saleType: pricingMode,
        paymentMethod,
        amountPaid: paid,
        businessDate,
      };
      const result = await completeSale(payload);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (result) => {
      const receiptLines = lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      }));
      setReceipt({
        invoiceNo: result.invoiceNo,
        totalAmount: result.totalAmount,
        changeGiven: result.changeGiven,
        balanceDue: result.balanceDue,
        saleId: result.saleId,
        paymentMethod,
        customerName: customerLabel,
        lines: receiptLines,
      });
      setCheckoutOpen(false);
      setCartSheetOpen(false);
      clear();
      setCartDiscount(0);
      setAmountPaid("");
      setCustomerId("");
      setCustomerName(null);
      setReceiptIssued(false);
      setReceiptPreviewOpen(false);
      setPaymentMethod("cash");
      clearPersisted();
      toast.success(
        businessDate !== new Date().toISOString().slice(0, 10)
          ? `Sale ${result.invoiceNo} recorded for ${businessDate}`
          : `Sale ${result.invoiceNo} completed`
      );
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    },
  });

  const openCheckout = useCallback(() => {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setAmountPaid(String(Math.round(total)));
    setCartSheetOpen(false);
    setCheckoutOpen(true);
  }, [lines.length, total]);

  const openMobileCart = useCallback(() => {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setCartSheetOpen(true);
  }, [lines.length]);

  const triggerStkPush = async (saleId: string, amount: number) => {
    if (!mpesaPhone.trim()) {
      toast.error("Enter customer M-Pesa phone number");
      return;
    }
    setStkPending(true);
    try {
      const res = await fetch("/api/mpesa/stkpush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: mpesaPhone.trim(),
          amount,
          saleId,
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "STK push failed");
      }
      toast.success(body.message ?? "STK push sent — check phone");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "STK push failed");
    } finally {
      setStkPending(false);
    }
  };

  const buildPrintPayload = useCallback(
    (invoiceNo: string, isPreview: boolean) => {
      if (!session) return null;
      const paid = Number(amountPaid) || 0;
      return {
        organizationName: session.organizationName,
        invoiceNo,
        totalAmount: total,
        changeGiven:
          paymentMethod === "cash" && paid > total
            ? Math.round(paid - total)
            : 0,
        balanceDue: balanceDuePreview,
        paymentMethod,
        lines: lines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        soldAt: new Date(),
        customerName: customerLabel,
        subtotal,
        discountAmount,
        taxAmount,
        taxRate,
        isPreview,
      };
    },
    [
      session,
      amountPaid,
      total,
      paymentMethod,
      balanceDuePreview,
      lines,
      customerLabel,
      subtotal,
      discountAmount,
      taxAmount,
      taxRate,
    ]
  );

  const handleOpenReceiptPreview = useCallback(() => {
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (needsCustomer) {
      toast.error("Select a registered customer for partial or on-account payment");
      return;
    }
    setReceiptPreviewOpen(true);
  }, [lines.length, needsCustomer]);

  const handlePrintPreviewReceipt = useCallback(() => {
    const payload = buildPrintPayload("PREVIEW", true);
    if (!payload) return;
    printPosReceipt(payload);
    setReceiptIssued(true);
    toast.success("Receipt sent to printer");
  }, [buildPrintPayload]);

  const handleConfirmReceipt = useCallback(() => {
    setReceiptIssued(true);
    setReceiptPreviewOpen(false);
    toast.success("You can complete the sale when ready");
  }, []);

  const handlePrintReceipt = () => {
    if (!receipt || !session) return;
    printPosReceipt({
      organizationName: session.organizationName,
      invoiceNo: receipt.invoiceNo,
      totalAmount: receipt.totalAmount,
      changeGiven: receipt.changeGiven,
      balanceDue: receipt.balanceDue,
      paymentMethod: receipt.paymentMethod,
      lines: receipt.lines,
      soldAt: new Date(),
      customerName: receipt.customerName,
    });
  };

  const handleCompleteSale = useCallback(() => {
    if (!receiptIssued) {
      toast.error("Issue and review the receipt before completing the sale");
      return;
    }
    if (needsCustomer) {
      toast.error("Select a registered customer for partial or on-account payment");
      return;
    }
    checkout.mutate();
  }, [receiptIssued, needsCustomer, checkout]);

  const cartSummary =
    lines.length > 0 ? `${itemCount} items · ${formatTzs(total)}` : null;

  const cartPanelProps = {
    lines,
    subtotal,
    discountAmount,
    taxAmount,
    total,
    taxRate,
    cartDiscount,
    onCartDiscountChange: setCartDiscount,
    onUpdateQuantity: updateQuantity,
    onRemoveLine: removeLine,
    onCheckout: openCheckout,
    onStockError: stockToast,
    inlineCheckout: true,
    paymentMethod,
    onPaymentMethodChange: setPaymentMethod,
    amountPaid,
    onAmountPaidChange: setAmountPaid,
    cashChange,
    onSetExactAmount: () => setAmountPaid(String(Math.round(total))),
    onIssueReceipt: handleOpenReceiptPreview,
    onCompleteSale: handleCompleteSale,
    receiptIssued,
    needsCustomer,
    isCheckoutPending: checkout.isPending,
    customerId,
    onCustomerIdChange: setCustomerId,
    onCustomerSelect: handleCustomerSelect,
  };

  if (outlets.length === 0) {
    return (
      <div className="pos-page flex h-full min-h-0 flex-1 flex-col">
        <PosHeader
          outlets={[]}
          outletId={null}
          pricingMode={pricingMode}
          onPricingModeChange={setPricingMode}
        />
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="max-w-md rounded-2xl border border-border bg-card p-8 shadow-card">
            <p className="text-lg font-semibold">No outlets configured</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Add an outlet in Settings before using the POS.
            </p>
            <Link
              href="/settings/outlets"
              className={cn(buttonVariants(), "mt-6 inline-flex rounded-xl")}
            >
              Manage outlets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pos-page flex h-full min-h-0 flex-1 flex-col">
      <PosHeader
        outlets={outlets}
        outletId={effectiveOutletId}
        pricingMode={pricingMode}
        onPricingModeChange={setPricingMode}
        cartSummary={cartSummary}
      />

      {effectiveOutletId ? (
        <PosSessionGate
          outletId={effectiveOutletId}
          sessionOverride={sessionOverride}
          onSessionOverride={() => setSessionOverride(true)}
        >
          {({ canSell }) => (
            <>
              <PosWholesaleBanner mode={pricingMode} customerName={customerName} />

              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(12rem,22%)_minmax(0,1fr)_minmax(16rem,30%)]">
                <PosCashflowPanel
                  outletId={effectiveOutletId}
                  products={products}
                  className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col"
                />
                <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-border pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
                  {effectiveOutletId && (
                    <PosFavoritesRow
                      outletId={effectiveOutletId}
                      products={products}
                      onPick={openQuantityFor}
                    />
                  )}

                  <div className="space-y-2 border-b p-3">
                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pos-search-input pos-touch h-12 rounded-2xl border border-border pl-12 pr-4 text-base shadow-inner focus-visible:ring-primary/30"
                        placeholder="Search or scan barcode..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            tryAddFromSearch();
                          }
                        }}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="search"
                        autoFocus
                      />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="pos-touch size-12 shrink-0 rounded-2xl"
                        aria-label="Refresh product list"
                        disabled={productsFetching}
                        onClick={() => void refetchProducts()}
                      >
                        <RefreshCw
                          className={cn("size-5", productsFetching && "animate-spin")}
                        />
                      </Button>
                    </div>
                    <PosCategoryChips value={categoryId} onChange={setCategoryId} />
                  </div>

                  <div className="pos-scroll-area min-h-0 flex-1 p-3">
                    {productsLoading ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
                        <Loader2 className="size-8 animate-spin text-primary" />
                        <p className="text-sm font-medium">Loading products…</p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="flex flex-col items-center py-16 text-center">
                        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-muted">
                          <Search className="size-7 text-muted-foreground/50" />
                        </div>
                        <p className="font-medium">No products found</p>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                          Add stock at this outlet or try another search term.
                        </p>
                      </div>
                    ) : (
                      <div className="pos-product-grid grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                        {filtered.map((p) => (
                          <PosProductCard
                            key={p.id}
                            product={p}
                            pricingMode={pricingMode}
                            cartQty={cartQtyByProduct.get(p.id) ?? 0}
                            onAdd={() => addFromProduct(p, 1)}
                            onQtyClick={() => openQuantityFor(p)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <div className="hidden h-full min-h-0 min-w-0 bg-muted/20 lg:block">
                  <PosCartPanel
                    {...cartPanelProps}
                    className="h-full"
                    checkoutDisabled={!canSell}
                    showCheckoutButton={false}
                  />
                </div>
              </div>

              <div
                className={cn(
                  "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] backdrop-blur-md",
                  "pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
                )}
              >
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 flex-1 rounded-2xl border-outflow/40 text-outflow"
                    onClick={() => setCashflowSheetOpen(true)}
                  >
                    <Banknote className="mr-2 size-5" />
                    Cash out
                  </Button>
                  <Button
                    type="button"
                    className="h-12 flex-[1.4] rounded-2xl text-base font-semibold shadow-lg shadow-primary/25"
                    disabled={lines.length === 0}
                    onClick={openMobileCart}
                  >
                    <ShoppingBag className="mr-2 size-5" />
                    {lines.length === 0 ? (
                      "Cart"
                    ) : (
                      <>
                        Pay ({itemCount}) ·{" "}
                        <span className="font-money">{formatTzs(total)}</span>
                      </>
                    )}
                  </Button>
                </div>
                {!canSell && lines.length > 0 && (
                  <p className="mt-1.5 text-center text-xs text-destructive">
                    Open cash drawer to complete sale
                  </p>
                )}
              </div>

              <Dialog open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
                <DialogContent
                  showCloseButton
                  className={cn(
                    "flex max-h-[min(92vh,720px)] flex-col gap-0 overflow-hidden p-0",
                    "fixed inset-x-0 bottom-0 top-auto max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-3xl",
                    "data-open:slide-in-from-bottom data-closed:slide-out-to-bottom"
                  )}
                >
                  <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
                  <div className="flex h-[min(92vh,720px)] min-h-0 flex-col overflow-hidden">
                    <PosCartPanel
                      {...cartPanelProps}
                      className="h-full"
                      checkoutDisabled={!canSell}
                    />
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={cashflowSheetOpen} onOpenChange={setCashflowSheetOpen}>
                <DialogContent
                  showCloseButton
                  className={cn(
                    "flex max-h-[min(92vh,720px)] flex-col gap-0 overflow-hidden p-0",
                    "fixed inset-x-0 bottom-0 top-auto max-w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-3xl"
                  )}
                >
                  <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
                  {effectiveOutletId && (
                    <PosCashflowPanel
                      outletId={effectiveOutletId}
                      products={products}
                      className="h-[min(85vh,640px)] w-full border-r-0"
                    />
                  )}
                </DialogContent>
              </Dialog>

              <PosQuantityDialog
                product={qtyProduct}
                open={qtyOpen}
                onOpenChange={setQtyOpen}
                onConfirm={(quantity) => {
                  if (qtyProduct) addFromProduct(qtyProduct, quantity);
                }}
              />

              <PosCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                total={total}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                amountPaid={amountPaid}
                onAmountPaidChange={setAmountPaid}
                customerId={customerId}
                onCustomerIdChange={setCustomerId}
                mpesaPhone={mpesaPhone}
                onMpesaPhoneChange={setMpesaPhone}
                cashChange={cashChange}
                onBumpAmountPaid={bumpAmountPaid}
                onSetExactAmount={() =>
                  setAmountPaid(String(Math.round(total)))
                }
                onComplete={() => checkout.mutate()}
                isPending={checkout.isPending}
                onCustomerSelect={handleCustomerSelect}
              />

              <PosReceiptPreviewDialog
                open={receiptPreviewOpen}
                onOpenChange={setReceiptPreviewOpen}
                customerLabel={customerLabel}
                lines={receiptPreviewLines}
                subtotal={subtotal}
                discountAmount={discountAmount}
                taxAmount={taxAmount}
                total={total}
                taxRate={taxRate}
                paymentMethod={paymentMethod}
                amountPaid={paidAmount}
                onPrint={handlePrintPreviewReceipt}
                onConfirm={handleConfirmReceipt}
              />

              <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
                <DialogContent className="overflow-hidden p-0 sm:max-w-sm">
                  <div className="bg-inflow-muted px-6 pb-8 pt-10 text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-inflow/20">
                      <CheckCircle2 className="size-9 text-inflow" />
                    </div>
                    <DialogHeader className="space-y-1">
                      <DialogTitle className="text-xl">Sale complete</DialogTitle>
                    </DialogHeader>
                    {receipt && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Invoice{" "}
                        <strong className="text-foreground">
                          {receipt.invoiceNo}
                        </strong>
                      </p>
                    )}
                  </div>
                  {receipt && (
                    <div className="space-y-3 px-6 py-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total</span>
                        <span className="font-money font-semibold tabular-nums">
                          {formatTzs(receipt.totalAmount)}
                        </span>
                      </div>
                      {receipt.changeGiven > 0 && (
                        <div className="flex justify-between text-inflow">
                          <span>Change</span>
                          <span className="font-money font-bold tabular-nums">
                            {formatTzs(receipt.changeGiven)}
                          </span>
                        </div>
                      )}
                      {receipt.balanceDue > 0 && (
                        <div className="flex justify-between text-warning">
                          <span>Balance due</span>
                          <span className="font-money font-semibold tabular-nums">
                            {formatTzs(receipt.balanceDue)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter className="flex-col gap-2 border-t bg-muted/30 p-4 sm:flex-col">
                    {receipt && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 w-full rounded-xl"
                        onClick={handlePrintReceipt}
                      >
                        <Printer className="mr-2 size-4" />
                        Print receipt
                      </Button>
                    )}
                    {receipt && receipt.paymentMethod === "mpesa" && (
                      <Button
                        className="h-11 w-full rounded-xl"
                        variant="secondary"
                        disabled={stkPending}
                        onClick={() =>
                          triggerStkPush(receipt.saleId, receipt.totalAmount)
                        }
                      >
                        {stkPending ? "Sending STK…" : "Send M-Pesa STK push"}
                      </Button>
                    )}
                    {receipt && (
                      <Link
                        href={`/sales/${receipt.saleId}`}
                        className={cn(buttonVariants(), "h-11 w-full rounded-xl")}
                        onClick={() => setReceipt(null)}
                      >
                        <Receipt className="mr-2 size-4" />
                        View sale
                      </Link>
                    )}
                    <Button
                      variant="outline"
                      className="h-11 w-full rounded-xl"
                      onClick={() => setReceipt(null)}
                    >
                      New sale
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </PosSessionGate>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" />
        </div>
      )}
    </div>
  );
}
