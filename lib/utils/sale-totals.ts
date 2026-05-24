import { roundMoney } from "@/lib/utils/calculations";
import {
  computeTaxAmount,
  type OrgVatConfig,
} from "@/lib/vat/org-vat";

export type ResolvedSaleTotals = {
  subtotal: number;
  discountAmount: number;
  surchargeAmount: number;
  taxAmount: number;
  totalAmount: number;
};

/** Apply optional charge-total override (discount or overcharge vs line subtotal). */
export function resolveSaleTotals(params: {
  subtotal: number;
  cartDiscountAmount?: number;
  taxRate: number;
  vatConfig: OrgVatConfig;
  totalOverride?: number | null;
}): ResolvedSaleTotals {
  const lineSubtotal = roundMoney(params.subtotal);
  let discountAmount = roundMoney(
    Math.min(params.cartDiscountAmount ?? 0, lineSubtotal)
  );
  let taxableBase = roundMoney(lineSubtotal - discountAmount);
  let taxAmount = computeTaxAmount(taxableBase, params.vatConfig, params.taxRate);
  let totalAmount = roundMoney(taxableBase + taxAmount);
  let surchargeAmount = 0;

  const override = params.totalOverride;
  if (
    override != null &&
    Number.isFinite(override) &&
    override > 0
  ) {
    const target = roundMoney(override);
    let diff = roundMoney(totalAmount - target);

    if (Math.abs(diff) >= 0.01) {
      if (diff > 0) {
        discountAmount = roundMoney(
          Math.min(discountAmount + diff, lineSubtotal)
        );
        taxableBase = roundMoney(lineSubtotal - discountAmount);
        taxAmount = computeTaxAmount(
          taxableBase,
          params.vatConfig,
          params.taxRate
        );
        totalAmount = roundMoney(taxableBase + taxAmount);
        diff = roundMoney(totalAmount - target);
        if (diff > 0.01) {
          discountAmount = roundMoney(
            Math.min(discountAmount + diff, lineSubtotal)
          );
          taxableBase = roundMoney(lineSubtotal - discountAmount);
          taxAmount = computeTaxAmount(
            taxableBase,
            params.vatConfig,
            params.taxRate
          );
          totalAmount = roundMoney(taxableBase + taxAmount);
        }
      } else {
        surchargeAmount = roundMoney(-diff);
        totalAmount = target;
      }
    } else {
      totalAmount = target;
    }
  }

  return {
    subtotal: lineSubtotal,
    discountAmount,
    surchargeAmount,
    taxAmount,
    totalAmount,
  };
}
