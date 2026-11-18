import {
  hasMultipleUnits,
  pickDefaultSellUnit,
  resolveUnitPrice,
  type ProductUnitOption,
} from "@/lib/products/units";
import type { PosPricingMode, PosProductRow } from "@/hooks/usePosProducts";

export type PosAddToCartPayload = {
  unit: ProductUnitOption;
  quantity: number;
  unitPrice: number;
};

/** Multi-unit SKUs still use the qty/unit dialog; single-unit gets one-tap add. */
export function productNeedsQtyDialog(product: PosProductRow): boolean {
  return hasMultipleUnits(product.units ?? []);
}

export function buildDefaultAddPayload(
  product: PosProductRow,
  pricingMode: PosPricingMode,
  quantity = 1
): PosAddToCartPayload | null {
  const units = product.units ?? [];
  if (units.length === 0) {
    const fallback: ProductUnitOption = {
      id: `${product.id}:base`,
      unitLabel: product.unit || "pcs",
      factorToBase: 1,
      isBase: true,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      sortOrder: 0,
    };
    return {
      unit: fallback,
      quantity,
      unitPrice: resolveUnitPrice(
        fallback,
        product.retailPrice,
        product.wholesalePrice,
        pricingMode
      ),
    };
  }
  const unit = pickDefaultSellUnit(
    units,
    product.retailPrice,
    product.wholesalePrice,
    pricingMode
  );
  return {
    unit,
    quantity,
    unitPrice: resolveUnitPrice(
      unit,
      product.retailPrice,
      product.wholesalePrice,
      pricingMode
    ),
  };
}
