"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCategoriesForOrg } from "@/lib/actions/inventory";

export type PosCategory = { id: string; name: string };

export async function listCategoriesForPos(): Promise<PosCategory[]> {
  return listCategoriesForOrg();
}

export type PosRecentProduct = {
  productId: string;
  name: string;
  code: string | null;
  saleCount: number;
};

/** Best-selling products at an outlet (last 30 days) for POS quick picks. */
export async function getTopPosProducts(
  outletId: string,
  limit = 12
): Promise<PosRecentProduct[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: sales, error } = await supabase
    .from("sales")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("status", "completed")
    .gte("sale_date", since.toISOString())
    .limit(500);

  if (error || !sales?.length) return [];

  const saleIds = sales.map((s) => s.id);
  const { data: items } = await supabase
    .from("sale_items")
    .select("product_id, product_name, quantity")
    .in("sale_id", saleIds)
    .not("product_id", "is", null);

  const counts = new Map<
    string,
    { name: string; qty: number }
  >();

  for (const row of items ?? []) {
    if (!row.product_id) continue;
    const prev = counts.get(row.product_id);
    const add = Number(row.quantity);
    counts.set(row.product_id, {
      name: prev?.name ?? row.product_name,
      qty: (prev?.qty ?? 0) + add,
    });
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, limit);

  if (sorted.length === 0) return [];

  const productIds = sorted.map(([id]) => id);
  const { data: products } = await supabase
    .from("products")
    .select("id, name, code")
    .in("id", productIds);

  const productMap = new Map((products ?? []).map((p) => [p.id, p]));

  return sorted.map(([productId, meta]) => {
    const p = productMap.get(productId);
    return {
      productId,
      name: p?.name ?? meta.name,
      code: p?.code ?? null,
      saleCount: meta.qty,
    };
  });
}
