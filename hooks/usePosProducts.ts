"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPosCatalog } from "@/lib/api/pos-products-fetch";
import { fetchProductUnitsMap } from "@/lib/api/product-units-fetch";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import {
  defaultUnitsForProduct,
  enrichUnitsWithConversion,
  type ProductUnitOption,
} from "@/lib/products/units";

export type PosPricingMode = "retail" | "wholesale";

export type PosProductRow = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  unit: string;
  retailPrice: number;
  wholesalePrice: number;
  displayPrice: number;
  stockQty: number;
  costPrice: number;
  categoryId: string | null;
  units: ProductUnitOption[];
};

export function usePosProducts(
  outletId: string | null,
  pricingMode: PosPricingMode = "retail"
) {
  const envOk = getPublicSupabaseEnv().ok;

  return useQuery({
    queryKey: ["pos-products", outletId, pricingMode],
    enabled: envOk && !!outletId,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PosProductRow[]> => {
      if (!outletId) {
        return [];
      }

      const catalog = await fetchPosCatalog(outletId);

      let unitsByProduct: Record<string, ProductUnitOption[]> = {};
      try {
        unitsByProduct = await fetchProductUnitsMap(
          catalog.map((p) => p.id)
        );
      } catch {
        unitsByProduct = {};
      }

      return catalog.map((p) => {
        const displayPrice =
          pricingMode === "wholesale" ? p.wholesalePrice : p.retailPrice;
        const rawUnits =
          unitsByProduct[p.id]?.length > 0
            ? unitsByProduct[p.id]
            : defaultUnitsForProduct(
                p.id,
                p.unit,
                p.retailPrice,
                p.wholesalePrice
              );
        const units = enrichUnitsWithConversion(
          rawUnits,
          p.retailPrice,
          p.wholesalePrice,
          pricingMode
        );
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          barcode: p.barcode,
          unit: p.unit,
          retailPrice: p.retailPrice,
          wholesalePrice: p.wholesalePrice,
          displayPrice,
          stockQty: p.stockQty,
          costPrice: p.costPrice,
          categoryId: p.categoryId,
          units,
        };
      });
    },
  });
}
