"use client";

import { create } from "zustand";
import type { PosPricingMode } from "@/hooks/usePosProducts";

export type CartLine = {
  productId: string;
  name: string;
  unit: string;
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
    productId: string,
    quantity: number
  ) => { ok: true } | { ok: false; reason: "insufficient_stock"; available: number };
  removeLine: (productId: string) => void;
  setDiscountPct: (productId: string, discountPct: number) => void;
  syncLinePrices: (
    prices: Map<string, { unitPrice: number; pricingMode: PosPricingMode }>
  ) => number;
  clear: () => void;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  addProduct: (product, quantity = 1) => {
    const qty = Math.max(1, Math.floor(quantity));
    const s = get();
    const existing = s.lines.find((l) => l.productId === product.productId);
    if (existing) {
      const nextQty = existing.quantity + qty;
      if (nextQty > product.availableStock) {
        return {
          ok: false,
          reason: "insufficient_stock",
          available: product.availableStock,
        };
      }
      set({
        lines: s.lines.map((l) =>
          l.productId === product.productId
            ? {
                ...l,
                quantity: nextQty,
                unitPrice: product.unitPrice,
                pricingMode: product.pricingMode,
              }
            : l
        ),
      });
      return { ok: true };
    }
    if (product.availableStock < qty) {
      return {
        ok: false,
        reason: product.availableStock < 1 ? "out_of_stock" : "insufficient_stock",
        available: product.availableStock,
      };
    }
    set({
      lines: [
        ...s.lines,
        {
          ...product,
          quantity: qty,
          discountPct: 0,
        },
      ],
    });
    return { ok: true };
  },
  updateQuantity: (productId, quantity) => {
    const s = get();
    if (quantity <= 0) {
      set({ lines: s.lines.filter((l) => l.productId !== productId) });
      return { ok: true };
    }
    const line = s.lines.find((l) => l.productId === productId);
    if (!line) return { ok: true };
    if (quantity > line.availableStock) {
      return {
        ok: false,
        reason: "insufficient_stock",
        available: line.availableStock,
      };
    }
    set({
      lines: s.lines.map((l) =>
        l.productId === productId ? { ...l, quantity } : l
      ),
    });
    return { ok: true };
  },
  removeLine: (productId) =>
    set((s) => ({
      lines: s.lines.filter((l) => l.productId !== productId),
    })),
  setDiscountPct: (productId, discountPct) =>
    set((s) => ({
      lines: s.lines.map((l) =>
        l.productId === productId
          ? { ...l, discountPct: Math.min(100, Math.max(0, discountPct)) }
          : l
      ),
    })),
  syncLinePrices: (prices) => {
    let updated = 0;
    set((s) => ({
      lines: s.lines.map((l) => {
        const next = prices.get(l.productId);
        if (!next || next.unitPrice === l.unitPrice) return l;
        updated += 1;
        return {
          ...l,
          unitPrice: next.unitPrice,
          pricingMode: next.pricingMode,
        };
      }),
    }));
    return updated;
  },
  clear: () => set({ lines: [] }),
}));
