"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StockLevelRow = {
  outlet_id: string;
  outlet_name: string;
  product_id: string;
  code: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  cost_price: number;
  stock_value: number;
  reorder_point: number;
  needs_reorder: boolean;
};

export async function listStockLevels(
  outletId?: string | null
): Promise<StockLevelRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const filterOutlet = outletId ?? ctx.outletId;

  let stockQuery = supabase
    .from("stock")
    .select("outlet_id, product_id, quantity, cost_price")
    .eq("organization_id", ctx.organizationId);
  if (filterOutlet) {
    stockQuery = stockQuery.eq("outlet_id", filterOutlet);
  }
  const { data: stockRows, error: stockErr } = await stockQuery;
  if (stockErr) throw new Error(stockErr.message);
  if (!stockRows?.length) return [];

  const productIds = Array.from(new Set(stockRows.map((s) => s.product_id)));
  const outletIds = Array.from(new Set(stockRows.map((s) => s.outlet_id)));

  const [productsRes, outletsRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, code, name, unit, reorder_point")
      .in("id", productIds),
    supabase.from("outlets").select("id, name").in("id", outletIds),
  ]);
  if (productsRes.error) throw new Error(productsRes.error.message);
  if (outletsRes.error) throw new Error(outletsRes.error.message);

  const productMap = new Map((productsRes.data ?? []).map((p) => [p.id, p]));
  const outletMap = new Map((outletsRes.data ?? []).map((o) => [o.id, o]));

  return stockRows.map((row) => {
    const product = productMap.get(row.product_id);
    const outlet = outletMap.get(row.outlet_id);
    const qty = Number(row.quantity);
    const cost = Number(row.cost_price);
    const reorder = Number(product?.reorder_point ?? 0);
    return {
      outlet_id: row.outlet_id,
      outlet_name: outlet?.name ?? "—",
      product_id: row.product_id,
      code: product?.code ?? null,
      product_name: product?.name ?? "—",
      unit: product?.unit ?? "pcs",
      quantity: qty,
      cost_price: cost,
      stock_value: Math.round(qty * cost * 100) / 100,
      reorder_point: reorder,
      needs_reorder: qty <= reorder,
    };
  });
}
