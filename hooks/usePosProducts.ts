"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchPosCatalog } from "@/lib/api/pos-products-fetch";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import type { PosCatalogRow } from "@/lib/actions/pos";
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
  recentSoldQty: number;
  avgDailySold: number;
  units: ProductUnitOption[];
};

const POS_CATALOG_CACHE_PREFIX = "supafundi_pos_catalog";
const POS_CATALOG_LIMIT = 120;

function catalogCacheKey(outletId: string, search: string, categoryId: string | null) {
  return `${POS_CATALOG_CACHE_PREFIX}:${outletId}:${search.trim().toLowerCase()}:${categoryId ?? "all"}`;
}

function readCachedCatalog(
  outletId: string | null,
  search: string,
  categoryId: string | null
): PosCatalogRow[] | undefined {
  if (!outletId || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(catalogCacheKey(outletId, search, categoryId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { products?: PosCatalogRow[] };
    return Array.isArray(parsed.products) ? parsed.products : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedCatalog(
  outletId: string,
  search: string,
  categoryId: string | null,
  products: PosCatalogRow[]
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      catalogCacheKey(outletId, search, categoryId),
      JSON.stringify({ products, cachedAt: Date.now() })
    );
  } catch {
    /* Storage can fail in private mode; React Query still keeps in-memory cache. */
  }
}

function mapCatalogProducts(
  catalog: PosCatalogRow[],
  pricingMode: PosPricingMode
): PosProductRow[] {
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
      recentSoldQty: p.recentSoldQty ?? 0,
      avgDailySold: p.avgDailySold ?? 0,
      units,
    };
  });
}

export function usePosProducts(
  outletId: string | null,
  pricingMode: PosPricingMode = "retail",
  search = "",
  categoryId: string | null = null
) {
  const envOk = getPublicSupabaseEnv().ok;

  const query = useQuery({
    queryKey: ["pos-products", outletId, search, categoryId],
    enabled: envOk && !!outletId,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    initialData: () => readCachedCatalog(outletId, search, categoryId),
    initialDataUpdatedAt: () => 0,
    queryFn: async (): Promise<PosCatalogRow[]> => {
      if (!outletId) {
        return [];
      }

      const catalog = await fetchPosCatalog(outletId, {
        q: search,
        categoryId,
        limit: POS_CATALOG_LIMIT,
      });
      writeCachedCatalog(outletId, search, categoryId, catalog);
      return catalog;
    },
  });

  const data = useMemo(
    () => mapCatalogProducts(query.data ?? [], pricingMode),
    [query.data, pricingMode]
  );

  return { ...query, data };
}
