"use server";

import { revalidatePath } from "next/cache";
import { listProductPriceCatalog } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchByInChunks } from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";

export type StockStatus = "out_of_stock" | "low" | "ok";

export type StockLevelRow = {
  outlet_id: string;
  outlet_name: string;
  product_id: string;
  code: string | null;
  product_name: string;
  category_id: string | null;
  category_name: string;
  unit: string;
  quantity: number;
  cost_price: number;
  retail_price: number;
  stock_value: number;
  retail_stock_value: number;
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

/** Stock on hand uses the same product + price rows as Products → Price list. */
export async function listStockLevels(
  outletId?: string | null
): Promise<StockLevelRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const filterOutlet = outletId ?? ctx.outletId;
  if (!filterOutlet) return [];

  const catalog = await listProductPriceCatalog(filterOutlet);
  if (!catalog.length) return [];

  const productIds = catalog.map((p) => p.id);

  const velocity = new Map<string, number>();
  const { data: velocityRows, error: velErr } = await (
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
    p_outlet_id: filterOutlet,
    p_days: 30,
  });
  if (velErr) {
    throw new Error(velErr.message);
  }
  const productIdSet = new Set(productIds);
  for (const row of velocityRows ?? []) {
    const pid = row.product_id as string;
    if (!productIdSet.has(pid)) continue;
    velocity.set(pid, Number(row.qty) || 0);
  }

  const [stockRows, reorderRows, outletRow] = await Promise.all([
    fetchByInChunks(productIds, async (chunk) => {
      const { data, error } = await supabase
        .from("stock")
        .select("product_id, quantity")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", filterOutlet)
        .in("product_id", chunk);
      return { data, error };
    }),
    fetchByInChunks(productIds, async (chunk) => {
      const { data, error } = await supabase
        .from("products")
        .select("id, reorder_point")
        .in("id", chunk);
      return { data, error };
    }),
    supabase
      .from("outlets")
      .select("id, name")
      .eq("id", filterOutlet)
      .maybeSingle(),
  ]);

  const qtyMap = new Map<string, number>();
  for (const s of stockRows) {
    qtyMap.set(s.product_id, Number(s.quantity));
  }
  const reorderMap = new Map(
    reorderRows.map((p) => [p.id, Number(p.reorder_point ?? 0)])
  );
  const outletName = outletRow.data?.name ?? "—";

  return catalog.map((item) => {
    const qty = qtyMap.get(item.id) ?? 0;
    const cost = item.costPrice;
    const retail = item.retailPrice ?? 0;
    const reorder = reorderMap.get(item.id) ?? 0;
    const sold30 = velocity.get(item.id) ?? 0;
    const avgDaily = roundMoney(sold30 / 30);
    const daysOfCover =
      avgDaily > 0 ? Math.round((qty / avgDaily) * 10) / 10 : null;
    const targetQty = Math.max(reorder * 2, reorder);
    const suggested = Math.max(0, roundMoney(targetQty - qty));

    return {
      outlet_id: filterOutlet,
      outlet_name: outletName,
      product_id: item.id,
      code: item.code,
      product_name: item.name,
      category_id: item.categoryId,
      category_name: item.categoryName,
      unit: item.unit,
      quantity: qty,
      cost_price: cost,
      retail_price: retail,
      stock_value: roundMoney(qty * cost),
      retail_stock_value: roundMoney(qty * retail),
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
    outOfStockCount: rows.filter(
      (r) => r.quantity <= 0 && r.reorder_point > 0
    ).length,
  };
}

export type ItemStatementLine = {
  id: string;
  date: string;
  movementType: string;
  label: string;
  reference: string | null;
  referenceId: string | null;
  referenceType: string | null;
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

  const grnIds = (movements ?? [])
    .filter((m) => m.reference_type === "grn" && m.reference_id)
    .map((m) => m.reference_id as string);
  const grnDateMap = new Map<string, string>();
  if (grnIds.length > 0) {
    const { data: grns } = await supabase
      .from("grns")
      .select("id, received_date")
      .in("id", grnIds);
    for (const g of grns ?? []) {
      grnDateMap.set(g.id, `${g.received_date}T12:00:00.000Z`);
    }
  }

  const saleIds = (movements ?? [])
    .filter(
      (m) =>
        (m.reference_type === "sale" || m.reference_type === "sale_void") &&
        m.reference_id
    )
    .map((m) => m.reference_id as string);
  const saleNoMap = new Map<string, string>();
  const saleDateMap = new Map<string, string>();
  if (saleIds.length > 0) {
    const { data: sales } = await supabase
      .from("sales")
      .select("id, invoice_no, sale_date")
      .in("id", saleIds);
    for (const s of sales ?? []) {
      saleNoMap.set(s.id, s.invoice_no);
      saleDateMap.set(s.id, s.sale_date);
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
    let date = m.created_at as string;
    if (m.reference_type === "grn" && m.reference_id) {
      date = grnDateMap.get(m.reference_id) ?? date;
    } else if (
      (m.reference_type === "sale" || m.reference_type === "sale_void") &&
      m.reference_id
    ) {
      date = saleDateMap.get(m.reference_id) ?? date;
    }

    return {
      id: m.id,
      date,
      movementType: m.movement_type,
      label: typeLabels[m.movement_type] ?? m.movement_type,
      reference,
      referenceId: m.reference_id ?? null,
      referenceType: m.reference_type ?? null,
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
