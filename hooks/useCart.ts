"use client";

import { useMemo } from "react";
import { useCartStore, type CartLine } from "@/stores/cartStore";
import {
  computeLineTotal,
  computeVat,
  roundMoney,
} from "@/lib/utils/calculations";

export function useCart(taxRate = 18, cartDiscountAmount = 0) {
  const lines = useCartStore((s) => s.lines);
  const addProduct = useCartStore((s) => s.addProduct);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeLine = useCartStore((s) => s.removeLine);
  const setDiscountPct = useCartStore((s) => s.setDiscountPct);
  const clear = useCartStore((s) => s.clear);
  const syncLinePrices = useCartStore((s) => s.syncLinePrices);
  const syncLineCosts = useCartStore((s) => s.syncLineCosts);

  const totals = useMemo(() => {
    const lineTotals = lines.map((l: CartLine) =>
      computeLineTotal(l.quantity, l.unitPrice, l.discountPct)
    );
    const subtotal = roundMoney(lineTotals.reduce((s, t) => s + t, 0));
    const discountAmount = roundMoney(
      Math.min(cartDiscountAmount, subtotal)
    );
    const taxableBase = roundMoney(subtotal - discountAmount);
    const taxAmount = computeVat(taxableBase, taxRate);
    const total = roundMoney(taxableBase + taxAmount);
    return { subtotal, discountAmount, taxAmount, total, lineTotals };
  }, [lines, cartDiscountAmount, taxRate]);

  return {
    lines,
    addProduct,
    updateQuantity,
    removeLine,
    setDiscountPct,
    clear,
    syncLinePrices,
    syncLineCosts,
    ...totals,
  };
}
