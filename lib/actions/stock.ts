"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

export type StockStatus = "out_of_stock" | "low" | "ok";

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
  stock_status: StockStatus;
  avg_daily_sales: number;
  days_of_cover: number | null;
  suggested_order_qty: number;
};

function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (reorder > 0 && qty <= reorder) return "low";
  return "ok";
}

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

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();

  const velocity = new Map<string, number>();
  if (filterOutlet) {
    const { data: recentSales } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", filterOutlet)
      .eq("status", "completed")
      .gte("sale_date", sinceIso);
    const saleIds = (recentSales ?? []).map((s) => s.id);
    if (saleIds.length > 0) {
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .in("sale_id", saleIds)
        .in("product_id", productIds);
      for (const item of saleItems ?? []) {
        if (!item.product_id) continue;
        velocity.set(
          item.product_id,
          (velocity.get(item.product_id) ?? 0) + Number(item.quantity)
        );
      }
    }
  }

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
    const sold30 = velocity.get(row.product_id) ?? 0;
    const avgDaily = roundMoney(sold30 / 30);
    const daysOfCover =
      avgDaily > 0 ? Math.round((qty / avgDaily) * 10) / 10 : null;
    const targetQty = Math.max(reorder * 2, reorder);
    const suggested = Math.max(0, roundMoney(targetQty - qty));

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
      stock_status: stockStatus(qty, reorder),
      avg_daily_sales: avgDaily,
      days_of_cover: daysOfCover,
      suggested_order_qty: suggested,
    };
  });
}
