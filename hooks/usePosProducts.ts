"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPosCatalog } from "@/lib/api/pos-products-fetch";
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
  pricingMode: PosPricingMode = "retail",
  search = "",
  categoryId: string | null = null
) {
  const envOk = getPublicSupabaseEnv().ok;

  return useQuery({
    queryKey: ["pos-products", outletId, pricingMode, search, categoryId],
    enabled: envOk && !!outletId,
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PosProductRow[]> => {
      if (!outletId) {
        return [];
      }

      const catalog = await fetchPosCatalog(outletId, {
        q: search,
        categoryId,
        limit: 80,
      });

      return catalog.map((p) => {
        const displayPrice =
          pricingMode === "wholesale" ? p.wholesalePrice : p.retailPrice;
        const rawUnits = defaultUnitsForProduct(
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
          costPrice: 0,
          categoryId: p.categoryId,
          units,
        };
      });
    },
  });
}
