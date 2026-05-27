export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Stock / sell qty — matches numeric(15,3) in the database. */
export function roundStockQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function computeLineTotal(
  quantity: number,
  unitPrice: number,
  discountPct: number
): number {
  const gross = quantity * unitPrice;
  const discounted = gross * (1 - discountPct / 100);
  return roundMoney(discounted);
}

export function computeVat(amountExVat: number, vatRatePct: number): number {
  return roundMoney(amountExVat * (vatRatePct / 100));
}

/** Retail from cost using markup % on cost (default 40% → retail = cost × 1.4). */
export function retailPriceFromCost(
  cost: number,
  marginPctOnCost = 40
): number {
  if (cost <= 0) return 0;
  return roundMoney(cost * (1 + marginPctOnCost / 100));
}
