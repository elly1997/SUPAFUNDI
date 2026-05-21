export type ProductUnitOption = {
  id: string;
  unitLabel: string;
  factorToBase: number;
  isBase: boolean;
  retailPrice: number | null;
  wholesalePrice: number | null;
  sortOrder: number;
};

export function cartLineKey(productId: string, unitLabel: string): string {
  return `${productId}:${unitLabel}`;
}

export function maxSellQtyInUnit(
  baseStockQty: number,
  factorToBase: number
): number {
  if (factorToBase <= 0) return 0;
  return Math.floor(baseStockQty / factorToBase);
}

export function resolveUnitPrice(
  unit: ProductUnitOption,
  baseRetail: number,
  baseWholesale: number,
  pricingMode: "retail" | "wholesale"
): number {
  const explicit =
    pricingMode === "wholesale"
      ? unit.wholesalePrice ?? unit.retailPrice
      : unit.retailPrice ?? unit.wholesalePrice;
  if (explicit != null && explicit > 0) return explicit;
  const base = pricingMode === "wholesale" ? baseWholesale : baseRetail;
  return Math.round(base * unit.factorToBase);
}

export function defaultUnitsForProduct(
  productId: string,
  baseUnit: string,
  retailPrice: number,
  wholesalePrice?: number
): ProductUnitOption[] {
  return [
    {
      id: `default-${productId}`,
      unitLabel: baseUnit,
      factorToBase: 1,
      isBase: true,
      retailPrice,
      wholesalePrice: wholesalePrice ?? retailPrice,
      sortOrder: 0,
    },
  ];
}

export function hasMultipleUnits(units: ProductUnitOption[]): boolean {
  return units.length > 1;
}
