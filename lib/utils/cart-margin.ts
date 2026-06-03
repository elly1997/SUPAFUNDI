import { cartLineAsUnit, sellQtyToBaseQty } from "@/lib/products/units";
import type { CartLine } from "@/stores/cartStore";
import { roundMoney } from "@/lib/utils/calculations";
import { resolveSaleTotals } from "@/lib/utils/sale-totals";

export type CartMarginSummary = {
  cogs: number;
  revenueExVat: number;
  grossProfit: number;
  marginPct: number;
  linesWithCost: number;
  lineCount: number;
};

export function computeCartCogs(lines: CartLine[]): {
  cogs: number;
  linesWithCost: number;
} {
  let cogs = 0;
  let linesWithCost = 0;
  for (const line of lines) {
    const cost = Number(line.baseCostPrice ?? 0);
    if (cost <= 0) continue;
    linesWithCost += 1;
    const baseQty = sellQtyToBaseQty(line.quantity, cartLineAsUnit(line));
    cogs += baseQty * cost;
  }
  return { cogs: roundMoney(cogs), linesWithCost };
}

/** Expected gross margin from cart lines and charge total (ex-VAT revenue vs outlet cost). */
export function computeCartMargin(
  lines: CartLine[],
  subtotal: number,
  chargeTotal: number,
  taxRate: number,
  vatEnabled: boolean
): CartMarginSummary | null {
  if (lines.length === 0) return null;

  const { cogs, linesWithCost } = computeCartCogs(lines);
  if (linesWithCost === 0) return null;

  const resolved = resolveSaleTotals({
    subtotal,
    taxRate,
    vatConfig: { enabled: vatEnabled, rate: taxRate },
    totalOverride: chargeTotal > 0 ? chargeTotal : null,
  });

  const revenueExVat = roundMoney(
    resolved.subtotal - resolved.discountAmount + resolved.surchargeAmount
  );
  const grossProfit = roundMoney(revenueExVat - cogs);
  const marginPct =
    revenueExVat > 0
      ? Math.round((grossProfit / revenueExVat) * 1000) / 10
      : 0;

  return {
    cogs,
    revenueExVat,
    grossProfit,
    marginPct,
    linesWithCost,
    lineCount: lines.length,
  };
}
