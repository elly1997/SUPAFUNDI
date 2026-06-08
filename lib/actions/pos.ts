"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { listCategoriesForOrg } from "@/lib/actions/inventory";
import { listProductUnitsMap } from "@/lib/actions/product-units";
import type { ProductUnitOption } from "@/lib/products/units";
import { defaultUnitsForProduct } from "@/lib/products/units";

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

/** Full active catalogue for POS (paginated server-side; not capped at 500). */
export type PosCatalogRow = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  unit: string;
  categoryId: string | null;
  retailPrice: number;
  wholesalePrice: number;
  stockQty: number;
  costPrice: number;
  recentSoldQty: number;
  avgDailySold: number;
  /** All sell units (pcs, box, kg, …) when configured in inventory. */
  units: ProductUnitOption[];
};

export type PosCatalogInput = {
  outletId: string;
  q?: string | null;
  categoryId?: string | null;
  limit?: number;
};

function normalizeLimit(input?: number) {
  const n = Math.floor(Number(input) || 80);
  return Math.min(120, Math.max(20, n));
}

function escapeLikePattern(value: string) {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

async function loadSalesVelocity(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  outletId: string
) {
  const velocity = new Map<string, number>();
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: "get_product_sales_velocity",
        args: { p_outlet_id: string; p_days: number }
      ) => Promise<{
        data: { product_id: string; qty: number }[] | null;
        error: { message: string } | null;
      }>;
    }
  ).rpc("get_product_sales_velocity", {
    p_outlet_id: outletId,
    p_days: 30,
  });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    velocity.set(row.product_id, Number(row.qty) || 0);
  }
  return velocity;
}

export async function listPosCatalogProducts(
  input: PosCatalogInput
): Promise<PosCatalogRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const search = input.q?.trim() ?? "";
  const categoryId =
    input.categoryId && input.categoryId !== "all" ? input.categoryId : null;
  const limit = normalizeLimit(input.limit);
  const velocity = await loadSalesVelocity(supabase, input.outletId);

  let query = supabase
    .from("products")
    .select("id, name, code, barcode, unit, category_id")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (search) {
    const like = `%${escapeLikePattern(search)}%`;
    query = query.or(`name.ilike.${like},code.ilike.${like},barcode.ilike.${like}`);
  }

  const queryLimit = search || categoryId ? Math.min(limit * 3, 360) : 360;
  const { data: productsRaw, error: productErr } = await query
    .order("name", { ascending: true })
    .limit(queryLimit);
  if (productErr) throw new Error(productErr.message);
  const products = productsRaw ?? [];

  if (!products.length) return [];

  const ids = products.map((p) => p.id);

  const [priceRows, stockRows, unitsMap] = await Promise.all([
    fetchByInChunks(ids, async (chunk) => {
      const { data, error } = await supabase
        .from("product_prices")
        .select("product_id, price_type, price")
        .in("product_id", chunk)
        .in("price_type", ["retail", "wholesale"])
        .is("effective_to", null);
      return { data, error };
    }),
    fetchByInChunks(ids, async (chunk) => {
      const { data, error } = await supabase
        .from("stock")
        .select("product_id, quantity, cost_price")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", input.outletId)
        .in("product_id", chunk);
      return { data, error };
    }),
    listProductUnitsMap(ids),
  ]);

  const retailMap = new Map<string, number>();
  const wholesaleMap = new Map<string, number>();
  for (const p of priceRows) {
    const price = Number(p.price);
    if (p.price_type === "retail") retailMap.set(p.product_id, price);
    if (p.price_type === "wholesale") wholesaleMap.set(p.product_id, price);
  }

  const stockMap = new Map(
    stockRows.map((s) => [
      s.product_id,
      { qty: Number(s.quantity), cost: Number(s.cost_price ?? 0) },
    ])
  );

  return products
    .map((p) => {
      const stock = stockMap.get(p.id);
      const retailPrice = retailMap.get(p.id) ?? 0;
      const wholesalePrice = wholesaleMap.get(p.id) ?? retailPrice;
      const recentSoldQty = velocity.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        barcode: p.barcode,
        unit: p.unit,
        categoryId: p.category_id as string | null,
        retailPrice,
        wholesalePrice,
        stockQty: stock?.qty ?? 0,
        costPrice: stock?.cost ?? 0,
        recentSoldQty,
        avgDailySold: Math.round((recentSoldQty / 30) * 10) / 10,
        units:
          unitsMap[p.id]?.length
            ? unitsMap[p.id]!
            : defaultUnitsForProduct(
                p.id,
                p.unit,
                retailPrice,
                wholesalePrice
              ),
      };
    })
    .filter((p) => p.stockQty > 0 || p.retailPrice > 0 || p.wholesalePrice > 0)
    .sort((a, b) => {
      const demand = b.recentSoldQty - a.recentSoldQty;
      if (demand !== 0) return demand;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

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
