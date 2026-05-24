"use client";

import { create } from "zustand";
import { cartLineKey, maxSellFromCartFields } from "@/lib/products/units";
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
  clear: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addProduct: (product, quantity = 1) => {
    const qty = Math.max(1, Math.floor(quantity));
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
      const nextQty = existing.quantity + qty;
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
              }
            : l
        ),
      });
      return { ok: true };
    }
    if (maxSell < qty) {
      return {
        ok: false,
        reason: maxSell < 1 ? "out_of_stock" : "insufficient_stock",
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
    const maxSell = maxSellFromCartFields(
      line.availableStock,
      line.factorToBase,
      line.unitsPerBase
    );
    if (quantity > maxSell) {
      return {
        ok: false,
        reason: "insufficient_stock",
        available: maxSell,
      };
    }
    set({
      lines: s.lines.map((l) =>
        l.lineKey === lineKey ? { ...l, quantity } : l
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
  clear: () => set({ lines: [] }),
}));
