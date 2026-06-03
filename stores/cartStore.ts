"use client";

import { create } from "zustand";
import { cartLineKey, maxSellFromCartFields, MIN_SELL_QTY, parseSellQty, roundSellQty } from "@/lib/products/units";
import type { PosPricingMode } from "@/hooks/usePosProducts";

export type CartLine = {
  productId: string;
  lineKey: string;
  name: string;
  unit: string;
  factorToBase: number;
  unitsPerBase?: boolean;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  availableStock: number;
  /** Outlet stock cost per base unit (for margin estimate). */
  baseCostPrice: number;
  pricingMode?: PosPricingMode;
};

export type AddProductResult =
  | { ok: true }
  | {
      ok: false;
      reason: "out_of_stock" | "insufficient_stock";
      available: number;
    };

type CartState = {
  lines: CartLine[];
  addProduct: (
    product: Omit<CartLine, "quantity" | "discountPct">,
    quantity?: number
  ) => AddProductResult;
  updateQuantity: (
    lineKey: string,
    quantity: number
  ) => { ok: true } | { ok: false; reason: "insufficient_stock"; available: number };
  removeLine: (lineKey: string) => void;
  setDiscountPct: (lineKey: string, discountPct: number) => void;
  syncLinePrices: (
    prices: Map<string, { unitPrice: number; pricingMode: PosPricingMode }>
  ) => number;
  syncLineCosts: (costs: Map<string, number>) => number;
  clear: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addProduct: (product, quantity = 1) => {
    const qty = parseSellQty(quantity);
    const lineKey =
      product.lineKey ?? cartLineKey(product.productId, product.unit);
    const maxSell = maxSellFromCartFields(
      product.availableStock,
      product.factorToBase,
      product.unitsPerBase
    );
    const s = get();
    const existing = s.lines.find((l) => l.lineKey === lineKey);
    if (existing) {
      const nextQty = roundSellQty(existing.quantity + qty);
      if (nextQty > maxSell) {
        return {
          ok: false,
          reason: "insufficient_stock",
          available: maxSell,
        };
      }
      set({
        lines: s.lines.map((l) =>
          l.lineKey === lineKey
            ? {
                ...l,
                quantity: nextQty,
                unitPrice: product.unitPrice,
                pricingMode: product.pricingMode,
                availableStock: product.availableStock,
                baseCostPrice: product.baseCostPrice,
              }
            : l
        ),
      });
      return { ok: true };
    }
    if (maxSell < qty) {
      return {
        ok: false,
        reason: maxSell < MIN_SELL_QTY ? "out_of_stock" : "insufficient_stock",
        available: maxSell,
      };
    }
    set({
      lines: [
        ...s.lines,
        {
          ...product,
          lineKey,
          quantity: qty,
          discountPct: 0,
          baseCostPrice: product.baseCostPrice ?? 0,
        },
      ],
    });
    return { ok: true };
  },
  updateQuantity: (lineKey, quantity) => {
    const s = get();
    if (quantity <= 0) {
      set({ lines: s.lines.filter((l) => l.lineKey !== lineKey) });
      return { ok: true };
    }
    const line = s.lines.find((l) => l.lineKey === lineKey);
    if (!line) return { ok: true };
    const qty = roundSellQty(quantity);
    const maxSell = maxSellFromCartFields(
      line.availableStock,
      line.factorToBase,
      line.unitsPerBase
    );
    if (qty > maxSell) {
      return {
        ok: false,
        reason: "insufficient_stock",
        available: maxSell,
      };
    }
    set({
      lines: s.lines.map((l) =>
        l.lineKey === lineKey ? { ...l, quantity: qty } : l
      ),
    });
    return { ok: true };
  },
  removeLine: (lineKey) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.lineKey !== lineKey),
    })),
  setDiscountPct: (lineKey, discountPct) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.lineKey === lineKey
          ? { ...l, discountPct: Math.min(100, Math.max(0, discountPct)) }
          : l
      ),
    })),
  syncLinePrices: (prices) => {
    const s = get();
    let updated = 0;
    const nextLines = s.lines.map((l) => {
      const next = prices.get(l.lineKey);
      if (!next || next.unitPrice === l.unitPrice) return l;
      updated += 1;
      return {
        ...l,
        unitPrice: next.unitPrice,
        pricingMode: next.pricingMode,
      };
    });
    if (updated > 0) {
      set({ lines: nextLines });
    }
    return updated;
  },
  syncLineCosts: (costs) => {
    const s = get();
    let updated = 0;
    const nextLines = s.lines.map((l) => {
      const nextCost = costs.get(l.productId);
      if (nextCost == null || nextCost === l.baseCostPrice) return l;
      updated += 1;
      return { ...l, baseCostPrice: nextCost };
    });
    if (updated > 0) {
      set({ lines: nextLines });
    }
    return updated;
  },
  clear: () => set({ lines: [] }),
}));
