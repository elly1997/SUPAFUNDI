export type ProductUnitOption = {
  id: string;
  unitLabel: string;
  /** Base stock units consumed per 1 sell unit (box), OR count of this unit per 1 base when unitsPerBase. */
  factorToBase: number;
  isBase: boolean;
  /** When true, factor = how many of this unit are in 1 base stock unit (e.g. 200 meters per roll). */
  unitsPerBase?: boolean;
  retailPrice: number | null;
  wholesalePrice: number | null;
  sortOrder: number;
};

export function cartLineKey(productId: string, unitLabel: string): string {
  return `${productId}:${unitLabel}`;
}

export function findBaseUnit(
  units: ProductUnitOption[]
): ProductUnitOption | undefined {
  return units.find((u) => u.isBase) ?? units[0];
}

/**
 * POS default sell unit — prefer retail denomination (e.g. meter) over stock base (e.g. roll).
 */
export function pickDefaultSellUnit(
  units: ProductUnitOption[],
  baseRetail: number,
  baseWholesale: number,
  pricingMode: "retail" | "wholesale" = "retail"
): ProductUnitOption {
  if (units.length === 0) {
    throw new Error("pickDefaultSellUnit requires at least one unit");
  }
  if (units.length === 1) return units[0]!;

  const enriched = enrichUnitsWithConversion(
    units,
    baseRetail,
    baseWholesale,
    pricingMode
  );
  const nonBase = enriched.filter((u) => !u.isBase);
  const perBaseUnits = nonBase.filter((u) => u.unitsPerBase);
  if (perBaseUnits.length === 1) return perBaseUnits[0]!;

  const base = findBaseUnit(enriched) ?? enriched[0]!;
  const basePrice = resolveUnitPrice(
    base,
    baseRetail,
    baseWholesale,
    pricingMode
  );

  if (perBaseUnits.length > 1) {
    return perBaseUnits.reduce((best, u) =>
      resolveUnitPrice(u, baseRetail, baseWholesale, pricingMode) <
      resolveUnitPrice(best, baseRetail, baseWholesale, pricingMode)
        ? u
        : best
    );
  }

  const withExplicit = nonBase.filter((u) => {
    const p =
      pricingMode === "wholesale" ? u.wholesalePrice : u.retailPrice;
    return p != null && p > 0;
  });
  if (withExplicit.length === 1) return withExplicit[0]!;

  let cheapest: ProductUnitOption | null = null;
  let cheapestPrice = Infinity;
  for (const u of nonBase) {
    const p = resolveUnitPrice(u, baseRetail, baseWholesale, pricingMode);
    if (p > 0 && p < cheapestPrice && p < basePrice) {
      cheapest = u;
      cheapestPrice = p;
    }
  }
  if (cheapest) return cheapest;

  return base;
}

/** Infer smaller sell unit priced per piece of a larger stock unit (meters per roll). */
export function usesUnitsPerBase(
  unit: ProductUnitOption,
  baseUnit: ProductUnitOption | undefined,
  baseRetail: number,
  baseWholesale: number,
  pricingMode: "retail" | "wholesale" = "retail"
): boolean {
  if (unit.unitsPerBase != null) return unit.unitsPerBase;
  if (unit.isBase || !baseUnit) return false;
  const unitPrice = resolveUnitPrice(
    unit,
    baseRetail,
    baseWholesale,
    pricingMode
  );
  const basePrice = resolveUnitPrice(
    baseUnit,
    baseRetail,
    baseWholesale,
    pricingMode
  );
  if (
    (unit.retailPrice != null || unit.wholesalePrice != null) &&
    basePrice > 0
  ) {
    return unitPrice < basePrice;
  }
  return false;
}

export function enrichUnitsWithConversion(
  units: ProductUnitOption[],
  baseRetail: number,
  baseWholesale: number,
  pricingMode: "retail" | "wholesale" = "retail"
): ProductUnitOption[] {
  const baseUnit = findBaseUnit(units);
  return units.map((u) => ({
    ...u,
    unitsPerBase: usesUnitsPerBase(
      u,
      baseUnit,
      baseRetail,
      baseWholesale,
      pricingMode
    ),
  }));
}

/** Max quantity sellable in this unit given stock held in base UOM. */
export function maxSellQtyInUnit(
  baseStockQty: number,
  unit: ProductUnitOption,
  unitsPerBase?: boolean
): number {
  const perBase = unitsPerBase ?? unit.unitsPerBase ?? false;
  if (baseStockQty <= 0 || unit.factorToBase <= 0) return 0;
  if (unit.isBase) return Math.floor(baseStockQty);
  if (perBase) {
    return Math.floor(baseStockQty * unit.factorToBase);
  }
  return Math.floor(baseStockQty / unit.factorToBase);
}

/** How much base stock is consumed when selling qty in this unit. */
export function sellQtyToBaseQty(
  sellQty: number,
  unit: ProductUnitOption,
  unitsPerBase?: boolean
): number {
  const perBase = unitsPerBase ?? unit.unitsPerBase ?? false;
  if (unit.isBase || perBase) {
    return sellQty / unit.factorToBase;
  }
  return sellQty * unit.factorToBase;
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
  if (unit.isBase) return base;
  if (unit.unitsPerBase) {
    return unit.factorToBase > 0 ? Math.round(base / unit.factorToBase) : base;
  }
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
      unitsPerBase: false,
      retailPrice,
      wholesalePrice: wholesalePrice ?? retailPrice,
      sortOrder: 0,
    },
  ];
}

export function maxSellFromCartFields(
  availableStock: number,
  factorToBase: number,
  unitsPerBase?: boolean
): number {
  return maxSellQtyInUnit(availableStock, {
    id: "cart",
    unitLabel: "",
    factorToBase,
    isBase: factorToBase === 1 && !unitsPerBase,
    unitsPerBase,
    retailPrice: null,
    wholesalePrice: null,
    sortOrder: 0,
  });
}

export function hasMultipleUnits(units: ProductUnitOption[]): boolean {
  return units.length > 1;
}

export function unitConversionHint(unit: ProductUnitOption): string {
  if (unit.isBase) return "";
  if (unit.unitsPerBase) {
    return ` · ${unit.factorToBase} per base`;
  }
  return unit.factorToBase > 1 ? ` · ×${unit.factorToBase} base` : "";
}
