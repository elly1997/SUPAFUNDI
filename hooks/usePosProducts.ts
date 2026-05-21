"use client";

import { useQuery } from "@tanstack/react-query";
import { PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/constants/data-limits";
import { fetchProductUnitsMap } from "@/lib/api/product-units-fetch";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import { getBrowserSupabase } from "@/lib/supabase/client";
import {
  defaultUnitsForProduct,
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
    queryKey: ["pos-products", outletId, pricingMode, PRODUCT_CATALOG_PAGE_SIZE],
    enabled: envOk && !!outletId,
    queryFn: async (): Promise<PosProductRow[]> => {
      const supabase = getBrowserSupabase();
      if (!supabase || !outletId) {
        return [];
      }

      const [productsRes, pricesRes, stockRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, code, barcode, unit, category_id")
          .eq("is_active", true)
          .order("name", { ascending: true })
          .limit(PRODUCT_CATALOG_PAGE_SIZE),
        supabase
          .from("product_prices")
          .select("product_id, price_type, price")
          .in("price_type", ["retail", "wholesale"])
          .is("effective_to", null),
        supabase
          .from("stock")
          .select("product_id, quantity, cost_price")
          .eq("outlet_id", outletId),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (stockRes.error) throw stockRes.error;

      const retailMap = new Map<string, number>();
      const wholesaleMap = new Map<string, number>();
      for (const p of pricesRes.data ?? []) {
        const price = Number(p.price);
        if (p.price_type === "retail") retailMap.set(p.product_id, price);
        if (p.price_type === "wholesale") wholesaleMap.set(p.product_id, price);
      }

      const stockMap = new Map(
        (stockRes.data ?? []).map((s) => [
          s.product_id,
          { qty: Number(s.quantity), cost: Number(s.cost_price) },
        ])
      );

      const productList = productsRes.data ?? [];
      let unitsByProduct: Record<string, ProductUnitOption[]> = {};
      try {
        unitsByProduct = await fetchProductUnitsMap(
          productList.map((p) => p.id)
        );
      } catch {
        unitsByProduct = {};
      }

      return productList
        .map((p) => {
          const stock = stockMap.get(p.id);
          const retailPrice = retailMap.get(p.id) ?? 0;
          const wholesalePrice = wholesaleMap.get(p.id) ?? retailPrice;
          const displayPrice =
            pricingMode === "wholesale" ? wholesalePrice : retailPrice;
          const units =
            unitsByProduct[p.id]?.length > 0
              ? unitsByProduct[p.id]
              : defaultUnitsForProduct(p.id, p.unit, retailPrice, wholesalePrice);
          return {
            id: p.id,
            name: p.name,
            code: p.code,
            barcode: p.barcode,
            unit: p.unit,
            retailPrice,
            wholesalePrice,
            displayPrice,
            stockQty: stock?.qty ?? 0,
            costPrice: stock?.cost ?? 0,
            categoryId: p.category_id,
            units,
          };
        })
        .filter((p) => p.stockQty > 0 || p.displayPrice > 0);
    },
  });
}
