export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
