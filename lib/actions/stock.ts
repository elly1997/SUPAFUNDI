"use server";

import { revalidatePath } from "next/cache";
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

export type StockValuationSummary = {
  totalValue: number;
  lineCount: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export async function getStockValuationSummary(
  outletId?: string | null
): Promise<StockValuationSummary> {
  const rows = await listStockLevels(outletId);
  return {
    totalValue: roundMoney(rows.reduce((s, r) => s + r.stock_value, 0)),
    lineCount: rows.length,
    lowStockCount: rows.filter((r) => r.stock_status === "low").length,
    outOfStockCount: rows.filter((r) => r.stock_status === "out_of_stock")
      .length,
  };
}

export type ItemStatementLine = {
  id: string;
  date: string;
  movementType: string;
  label: string;
  reference: string | null;
  quantityDelta: number;
  unitCost: number | null;
};

export async function getProductItemStatement(
  productId: string,
  outletId: string,
  limit = 80
): Promise<ItemStatementLine[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: movements, error } = await supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, unit_cost, reference_id, reference_type, notes, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const saleIds = (movements ?? [])
    .filter((m) => m.reference_type === "sale" && m.reference_id)
    .map((m) => m.reference_id as string);
  const saleNoMap = new Map<string, string>();
  if (saleIds.length > 0) {
    const { data: sales } = await supabase
      .from("sales")
      .select("id, invoice_no")
      .in("id", saleIds);
    for (const s of sales ?? []) {
      saleNoMap.set(s.id, s.invoice_no);
    }
  }

  const typeLabels: Record<string, string> = {
    sale: "Sale",
    purchase: "Purchase",
    transfer_in: "Transfer in",
    transfer_out: "Transfer out",
    adjustment_in: "Adjustment (+)",
    adjustment_out: "Adjustment (−)",
    return_in: "Return in",
    return_out: "Return out",
    opening: "Opening stock",
  };

  const outTypes = new Set([
    "sale",
    "transfer_out",
    "adjustment_out",
    "return_out",
  ]);

  return (movements ?? []).map((m) => {
    const qty = Number(m.quantity);
    const isOut = outTypes.has(m.movement_type);
    let reference: string | null = null;
    if (m.reference_type === "sale" && m.reference_id) {
      reference = saleNoMap.get(m.reference_id) ?? m.reference_id.slice(0, 8);
    } else if (m.reference_type === "grn") {
      reference = `GRN ${m.reference_id?.slice(0, 8) ?? ""}`;
    } else if (m.reference_type === "supplier_return") {
      reference = `Return ${m.reference_id?.slice(0, 8) ?? ""}`;
    } else if (m.notes) {
      reference = m.notes;
    }
    return {
      id: m.id,
      date: m.created_at,
      movementType: m.movement_type,
      label: typeLabels[m.movement_type] ?? m.movement_type,
      reference,
      quantityDelta: isOut ? -qty : qty,
      unitCost: m.unit_cost != null ? Number(m.unit_cost) : null,
    };
  });
}

export async function setStockQuantity(
  productId: string,
  outletId: string,
  newQuantity: number
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    if (newQuantity < 0) {
      return { ok: false, message: "Quantity cannot be negative." };
    }

    const { data: stock } = await supabase
      .from("stock")
      .select("id, quantity, cost_price")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("product_id", productId)
      .maybeSingle();

    const prevQty = Number(stock?.quantity ?? 0);
    const cost = Number(stock?.cost_price ?? 0);
    const delta = roundMoney(newQuantity - prevQty);

    if (!stock?.id) {
      const { error: insErr } = await supabase.from("stock").insert({
        organization_id: ctx.organizationId,
        outlet_id: outletId,
        product_id: productId,
        quantity: newQuantity,
        cost_price: 0,
      });
      if (insErr) return { ok: false, message: insErr.message };
      if (newQuantity > 0) {
        await supabase.from("stock_movements").insert({
          organization_id: ctx.organizationId,
          outlet_id: outletId,
          product_id: productId,
          movement_type: "adjustment_in",
          quantity: newQuantity,
          unit_cost: 0,
          reference_type: "adjustment",
          notes: "Stock quantity set",
          created_by: ctx.userId,
        });
      }
    } else {
      const { error: updErr } = await supabase
        .from("stock")
        .update({ quantity: newQuantity })
        .eq("id", stock.id);
      if (updErr) return { ok: false, message: updErr.message };

      if (delta !== 0) {
        await supabase.from("stock_movements").insert({
          organization_id: ctx.organizationId,
          outlet_id: outletId,
          product_id: productId,
          movement_type: delta > 0 ? "adjustment_in" : "adjustment_out",
          quantity: Math.abs(delta),
          unit_cost: cost,
          reference_type: "adjustment",
          notes: `Qty adjusted ${prevQty} → ${newQuantity}`,
          created_by: ctx.userId,
        });
      }
    }

    revalidatePath("/inventory/stock");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Quantity update failed",
    };
  }
}
