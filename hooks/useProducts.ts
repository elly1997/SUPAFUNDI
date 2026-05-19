"use client";

import { useQuery } from "@tanstack/react-query";
import { PRODUCT_CATALOG_PAGE_SIZE } from "@/lib/constants/data-limits";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getPublicSupabaseEnv } from "@/lib/env/public";

export type ProductListRow = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  is_active: boolean;
  category_id: string | null;
  categoryName: string;
};

/**
 * Product catalogue rows for the current org (RLS). Category name resolved client-side.
 */
export function useProducts() {
  const envOk = getPublicSupabaseEnv().ok;

  return useQuery({
    queryKey: ["products", "catalog", PRODUCT_CATALOG_PAGE_SIZE],
    enabled: envOk,
    queryFn: async (): Promise<ProductListRow[]> => {
      const supabase = getBrowserSupabase();
      if (!supabase) {
        return [];
      }
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, code, unit, is_active, category_id")
          .order("name", { ascending: true })
          .limit(PRODUCT_CATALOG_PAGE_SIZE),
        supabase.from("categories").select("id, name"),
      ]);
      if (productsRes.error) {
        throw productsRes.error;
      }
      if (categoriesRes.error) {
        throw categoriesRes.error;
      }
      const catMap = new Map(
        (categoriesRes.data ?? []).map((c) => [c.id, c.name])
      );
      return (productsRes.data ?? []).map((p) => ({
        ...p,
        categoryName: p.category_id
          ? (catMap.get(p.category_id) ?? "—")
          : "—",
      }));
    },
  });
}
