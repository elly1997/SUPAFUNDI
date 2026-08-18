"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PosCartPanel } from "@/components/pos/pos-cart-panel";
import { PosCategoryChips } from "@/components/pos/pos-category-chips";
import { PosCheckoutDialog } from "@/components/pos/pos-checkout-dialog";
import { PosCashflowPanel } from "@/components/pos/pos-cashflow-panel";
import { PosHeader, type PosOutletOption } from "@/components/pos/pos-header";
import { PosProductCard } from "@/components/pos/pos-product-card";
import {
  PosAddToCartDialog,
  type PosAddToCartPayload,
} from "@/components/pos/pos-add-to-cart-dialog";
import {
  formatPaymentMethodLabel,
  getReceiptStamp,
  printPosReceipt,
} from "@/components/pos/pos-receipt-print";
import { PosSessionGate } from "@/components/pos/pos-session-gate";
import { PosSyncStatus } from "@/components/pos/pos-sync-status";
import { PosWholesaleBanner } from "@/components/pos/pos-wholesale-banner";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import { needsPosPaymentAccount } from "@/components/pos/pos-payment-account-picker";
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
import { useTaxRate, useVatEnabled } from "@/hooks/useTaxRate";
import { usePersistedCart } from "@/hooks/usePersistedCart";
import {
  usePosProducts,
  type PosPricingMode,
  type PosProductRow,
} from "@/hooks/usePosProducts";
import type { CompleteSaleInput } from "@/lib/actions/sales";
import type { PosCustomer } from "@/lib/api/customers-fetch";
import { completeSaleApi } from "@/lib/api/daily-ops-fetch";
import { invalidateStockLevelsQueries } from "@/lib/query/invalidate-stock-queries";
import {
  cartLineKey,
  formatSellQty,
  resolveUnitPrice,
} from "@/lib/products/units";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { computeCartMargin } from "@/lib/utils/cart-margin";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import { canSwitchOutlets } from "@/lib/auth/roles";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";
import type { AddProductResult } from "@/stores/cartStore";

type ReceiptState = {
  invoiceNo: string;
  totalAmount: number;
  changeGiven: number;
  balanceDue: number;
  saleId: string;
  paymentMethod: PaymentMethod;
  customerName: string;
  lines: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
};

function stockToast(result: AddProductResult) {
  if (result.ok) return;
  if (result.reason === "out_of_stock") {
    toast.error("Out of stock");
  } else {
    toast.error(`Only ${formatSellQty(result.available)} in stock`);
  }
}

type PosTerminalProps = {
  outlets: PosOutletOption[];
};

export function PosTerminal({ outlets }: PosTerminalProps) {
  const queryClient = useQueryClient();
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const session = useAuthStore((s) => s.session);
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [chargeTotal, setChargeTotal] = useState("");
  const [chargeLocked, setChargeLocked] = useState(false);
  const taxRate = useTaxRate();
  const vatEnabled = useVatEnabled();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [cashflowSheetOpen, setCashflowSheetOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [stkPending, setStkPending] = useState(false);
  const [pricingMode, setPricingMode] = useState<PosPricingMode>("retail");
  const [sessionOverride, setSessionOverride] = useState(false);
  const [cashflowCollapsed, setCashflowCollapsed] = useState(false);
  const [qtyProduct, setQtyProduct] = useState<PosProductRow | null>(null);
  const [qtyOpen, setQtyOpen] = useState(false);
  const prevPricingModeRef = useRef<PosPricingMode>(pricingMode);

  const canSwitch = canSwitchOutlets(session?.role ?? null);

  useEffect(() => {
    if (!outlets.length) return;
    const resolved = resolveActiveOutletId(outlets, {
      stored: canSwitch ? activeOutletId : null,
      profileOutletId: session?.outletId,
    });
    if (resolved && resolved !== activeOutletId) {
      setActiveOutletId(resolved);
    }
  }, [activeOutletId, canSwitch, outlets, session?.outletId, setActiveOutletId]);

  const effectiveOutletId = resolveActiveOutletId(outlets, {
    stored: canSwitch ? activeOutletId : null,
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
    syncLineCosts,
    subtotal,
    taxAmount,
    total: calculatedTotal,
  } = useCart(taxRate, 0);

  const chargeAmount = Number(chargeTotal);
  const effectiveTotal =
    chargeTotal.trim() && Number.isFinite(chargeAmount) && chargeAmount >= 0
      ? Math.round(chargeAmount)
      : Math.round(calculatedTotal);
  const adjustment = Math.round(calculatedTotal - effectiveTotal);

  useEffect(() => {
    if (lines.length === 0) {
      setChargeTotal("");
      setChargeLocked(false);
      return;
    }
    if (!chargeLocked) {
      setChargeTotal(String(Math.round(calculatedTotal)));
    }
  }, [calculatedTotal, chargeLocked, lines.length]);

  const {
    data: products = [],
    isLoading: productsLoading,
    isFetching: productsFetching,
    refetch: refetchProducts,
  } = usePosProducts(effectiveOutletId, pricingMode, deferredSearch, categoryId);

  /** Re-price cart lines when retail/wholesale mode changes. */
  useEffect(() => {
    const modeChanged = prevPricingModeRef.current !== pricingMode;
    prevPricingModeRef.current = pricingMode;
    if (!modeChanged || !lines.length || !products.length) return;

    const map = new Map<
      string,
      { unitPrice: number; pricingMode: PosPricingMode }
    >();
    for (const line of lines) {
      const p = products.find((x) => x.id === line.productId);
      if (!p) continue;

      const unit = p.units.find((u) => u.unitLabel === line.unit);
      if (!unit) continue;

      map.set(line.lineKey, {
        unitPrice: resolveUnitPrice(
          unit,
          p.retailPrice,
          p.wholesalePrice,
          pricingMode
        ),
        pricingMode,
      });
    }

    const updated = syncLinePrices(map);
    if (updated > 0) {
      toast.message(`Updated ${updated} cart line price(s)`);
    }
  }, [pricingMode, lines, products, syncLinePrices]);

  useEffect(() => {
    if (!lines.length || !products.length) return;
    const costs = new Map<string, number>();
    for (const line of lines) {
      const p = products.find((x) => x.id === line.productId);
      if (p && p.costPrice > 0) {
        costs.set(p.id, p.costPrice);
      }
    }
    if (costs.size > 0) {
      syncLineCosts(costs);
    }
  }, [lines, products, syncLineCosts]);

  const cartMargin = useMemo(
    () =>
      computeCartMargin(
        lines,
        subtotal,
        effectiveTotal,
        taxRate,
        vatEnabled
      ),
    [lines, subtotal, effectiveTotal, taxRate, vatEnabled]
  );

  const listMargin = useMemo(
    () =>
      adjustment !== 0
        ? computeCartMargin(
            lines,
            subtotal,
            Math.round(calculatedTotal),
            taxRate,
            vatEnabled
          )
        : null,
    [lines, subtotal, calculatedTotal, taxRate, vatEnabled, adjustment]
  );

  const cartQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      const base =
        line.unitsPerBase
          ? line.quantity / line.factorToBase
          : line.quantity * line.factorToBase;
      map.set(line.productId, (map.get(line.productId) ?? 0) + base);
    }
    return map;
  }, [lines]);

  const itemCount = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
    [lines]
  );

  const filtered = products;

  const paidAmount = Number(amountPaid) || 0;
  const cashChange =
    paymentMethod === "cash" && paidAmount > effectiveTotal
      ? Math.round(paidAmount - effectiveTotal)
      : 0;
  const balanceDuePreview = Math.max(0, Math.round(effectiveTotal - paidAmount));
  const needsCustomer =
    !customerId &&
    (paymentMethod === "credit_account" || balanceDuePreview > 0);
  const needsPaymentAccount =
    needsPosPaymentAccount(paymentMethod) && !paymentAccountId;

  const customerLabel = customerId
    ? (customerName ?? "Registered customer")
    : "Walk-in";

  useEffect(() => {
    setPaymentAccountId("");
    if (paymentMethod === "credit_account") {
      setAmountPaid("0");
    }
  }, [paymentMethod]);

  useEffect(() => {
    if (lines.length > 0 && paymentMethod === "cash") {
      setAmountPaid((prev) => {
        const n = Number(prev);
        if (!prev || n === 0) return String(Math.round(effectiveTotal));
        return prev;
      });
    }
  }, [effectiveTotal, lines.length, paymentMethod]);

  const addFromProductWithUnit = useCallback(
    (p: PosProductRow, payload: PosAddToCartPayload) => {
      const { unit, quantity, unitPrice } = payload;
      const result = addProduct(
        {
          productId: p.id,
          lineKey: cartLineKey(p.id, unit.unitLabel),
          name: p.name,
          unit: unit.unitLabel,
          factorToBase: unit.factorToBase,
          unitsPerBase: unit.unitsPerBase,
          unitPrice,
          availableStock: p.stockQty,
          baseCostPrice: p.costPrice,
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

  const openAddDialogFor = useCallback((p: PosProductRow) => {
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

    openAddDialogFor(match);
    setSearch("");
  }, [search, products, filtered, openAddDialogFor]);

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
      const paid =
        paymentMethod === "credit_account"
          ? Math.max(0, Number(amountPaid) || 0)
          : Number(amountPaid) || 0;
      const payload: CompleteSaleInput = {
        outletId: effectiveOutletId,
        customerId: customerId || null,
        lines: lines.map((l) => ({
          productId: l.productId,
          productName: l.name,
          quantity: l.quantity,
          sellUnit: l.unit,
          factorToBase: l.factorToBase,
          unitsPerBase: l.unitsPerBase,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
        })),
        cartDiscountAmount: 0,
        totalOverride: effectiveTotal,
        taxRate,
        saleType: pricingMode,
        paymentMethod,
        amountPaid: paid,
        businessDate,
        ...(paymentAccountId ? { paymentAccountId } : {}),
      };
      const result = await completeSaleApi(payload);
      if (!result.ok) {
        throw new Error(result.message);
      }
      return result;
    },
    onSuccess: (result) => {
      clearPersisted();
      const receiptLines = lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
      }));
      const saleReceipt: ReceiptState = {
        invoiceNo: result.invoiceNo,
        totalAmount: result.totalAmount,
        changeGiven: result.changeGiven,
        balanceDue: result.balanceDue,
        saleId: result.saleId,
        paymentMethod,
        customerName: customerLabel,
        lines: receiptLines,
        subtotal,
        discountAmount: Math.max(0, Math.round(calculatedTotal - effectiveTotal)),
        taxAmount,
        taxRate,
      };
      setReceipt(saleReceipt);

      setCheckoutOpen(false);
      setCartSheetOpen(false);
      clear();
      setChargeTotal("");
      setChargeLocked(false);
      setAmountPaid("");
      setCustomerId("");
      setCustomerName(null);
      setPaymentMethod("cash");
      void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      void queryClient.invalidateQueries({
        queryKey: ["drawer-status", effectiveOutletId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["customer-credit-summary"],
      });
      void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      void invalidateStockLevelsQueries(queryClient, effectiveOutletId);
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
    setAmountPaid(
      paymentMethod === "credit_account"
        ? "0"
        : String(Math.round(effectiveTotal))
    );
    setCartSheetOpen(false);
    setCheckoutOpen(true);
  }, [lines.length, effectiveTotal, paymentMethod]);

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

  const handlePrintReceipt = () => {
    if (!receipt || !session) return;
    if (
      !printPosReceipt({
        organizationName: session.organizationName ?? "SUPAFUNDI TRADERS",
        invoiceNo: receipt.invoiceNo,
        totalAmount: receipt.totalAmount,
        changeGiven: receipt.changeGiven,
        balanceDue: receipt.balanceDue,
        paymentMethod: receipt.paymentMethod,
        lines: receipt.lines,
        soldAt: new Date(),
        customerName: receipt.customerName,
        compactTotal: true,
      })
    ) {
      toast.error("Allow pop-ups to print the receipt");
    }
  };

  const handleCompleteSale = useCallback(() => {
    if (checkout.isPending) {
      return;
    }
    if (lines.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (needsCustomer) {
      toast.error("Select a registered customer for partial or on-account payment");
      return;
    }
    if (needsPaymentAccount) {
      toast.error(
        `Select a collection account for ${formatPaymentMethodLabel(paymentMethod)}`
      );
      return;
    }
    checkout.mutate();
  }, [checkout, lines.length, needsCustomer, needsPaymentAccount, paymentMethod]);

  const showAmountPaid =
    paymentMethod === "credit_account" ||
    (paymentMethod === "cash" &&
      paidAmount > 0 &&
      Math.round(paidAmount) !== Math.round(effectiveTotal));

  const cartSummary =
    lines.length > 0 ? `${itemCount} items · ${formatTzs(effectiveTotal)}` : null;

  const cartPanelProps = {
    lines,
    subtotal,
    taxAmount,
    calculatedTotal,
    chargeTotal,
    onChargeTotalChange: setChargeTotal,
    onChargeTotalLock: () => setChargeLocked(true),
    taxRate,
    onUpdateQuantity: updateQuantity,
    onRemoveLine: removeLine,
    onCheckout: openCheckout,
    onStockError: stockToast,
    inlineCheckout: true,
    paymentMethod,
    onPaymentMethodChange: setPaymentMethod,
    amountPaid,
    onAmountPaidChange: setAmountPaid,
    onCompleteSale: handleCompleteSale,
    needsCustomer,
    needsPaymentAccount,
    showAmountPaid,
    isCheckoutPending: lines.length > 0 && checkout.isPending,
    customerId,
    onCustomerIdChange: setCustomerId,
    onCustomerSelect: handleCustomerSelect,
    paymentAccountId,
    onPaymentAccountIdChange: setPaymentAccountId,
    margin: cartMargin,
    listMargin,
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
        className="lg:hidden"
      />

      {effectiveOutletId ? (
        <PosSessionGate
          outletId={effectiveOutletId}
          sessionOverride={sessionOverride}
          onSessionOverride={() => setSessionOverride(true)}
        >
          {({ canSell }) => (
            <>
              <div
                className="pos-workspace-grid grid min-h-0 flex-1 overflow-hidden"
                data-cashflow={cashflowCollapsed ? "collapsed" : "expanded"}
              >
                <PosCashflowPanel
                  outletId={effectiveOutletId}
                  products={products}
                  collapsed={cashflowCollapsed}
                  onCollapsedChange={setCashflowCollapsed}
                  fetchEnabled={!cashflowCollapsed}
                  className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col"
                />
                <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-border pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
                  <PosHeader
                    outlets={outlets}
                    outletId={effectiveOutletId}
                    pricingMode={pricingMode}
                    onPricingModeChange={setPricingMode}
                    cartSummary={cartSummary}
                    showSync={false}
                    className="hidden lg:block"
                  />
                  <PosWholesaleBanner mode={pricingMode} customerName={customerName} />
                  <div className="space-y-2 border-b p-2.5">
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
                      <div className="hidden shrink-0 items-center xl:flex">
                        <PosSyncStatus />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>High-demand items appear first from recent sales.</span>
                      <span className="font-money">
                        {filtered.length} visible
                      </span>
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
                        <p className="font-medium">
                          {search.trim()
                            ? "No products found"
                            : "No items yet for this outlet"}
                        </p>
                        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                          {search.trim()
                            ? "Try another search term or check the item code for this outlet."
                            : "Import the outlet catalog first, then load opening stock before selling."}
                        </p>
                      </div>
                    ) : (
                      <div className="pos-catalog-grid grid gap-2">
                        {filtered.map((p) => (
                          <PosProductCard
                            key={p.id}
                            product={p}
                            pricingMode={pricingMode}
                            cartQty={cartQtyByProduct.get(p.id) ?? 0}
                            onAdd={() => openAddDialogFor(p)}
                            onQtyClick={() => openAddDialogFor(p)}
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
                        <span className="font-money">{formatTzs(effectiveTotal)}</span>
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
                    "!fixed !inset-x-0 !bottom-0 !top-auto !max-w-full !translate-x-0 !translate-y-0 rounded-b-none rounded-t-3xl",
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
                    "!fixed !inset-x-0 !bottom-0 !top-auto !max-w-full !translate-x-0 !translate-y-0 rounded-b-none rounded-t-3xl"
                  )}
                >
                  <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
                  {effectiveOutletId && (
                    <PosCashflowPanel
                      outletId={effectiveOutletId}
                      products={products}
                      fetchEnabled={cashflowSheetOpen}
                      className="h-[min(85vh,640px)] w-full border-r-0"
                    />
                  )}
                </DialogContent>
              </Dialog>

              <PosAddToCartDialog
                product={qtyProduct}
                pricingMode={pricingMode}
                open={qtyOpen}
                onOpenChange={setQtyOpen}
                onConfirm={(payload) => {
                  if (qtyProduct) addFromProductWithUnit(qtyProduct, payload);
                }}
              />

              <PosCheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                total={effectiveTotal}
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
                  setAmountPaid(String(Math.round(effectiveTotal)))
                }
                onComplete={() => checkout.mutate()}
                isPending={checkout.isPending}
                needsPaymentAccount={needsPaymentAccount}
                onCustomerSelect={handleCustomerSelect}
                paymentAccountId={paymentAccountId}
                onPaymentAccountIdChange={setPaymentAccountId}
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
                      <>
                        <p
                          className={cn(
                            "mt-3 inline-block rounded-lg border-2 px-4 py-1.5 text-sm font-extrabold tracking-wider",
                            getReceiptStamp(receipt) === "credit_sale"
                              ? "border-warning text-warning"
                              : "border-foreground text-foreground"
                          )}
                        >
                          {getReceiptStamp(receipt) === "credit_sale"
                            ? "CREDIT SALE"
                            : "PAID"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-foreground">
                          Payment:{" "}
                          {formatPaymentMethodLabel(receipt.paymentMethod)}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Invoice{" "}
                          <strong className="text-foreground">
                            {receipt.invoiceNo}
                          </strong>
                        </p>
                      </>
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
                        Print again
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
