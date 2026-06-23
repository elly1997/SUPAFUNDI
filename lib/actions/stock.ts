"use server";

import { revalidatePath } from "next/cache";
import { listProductPriceCatalog } from "@/lib/actions/inventory";
import { resolveCategoryName } from "@/lib/products/catalog-grouping";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ProductLite = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  category_id: string | null;
  reorder_point: number;
};

function escapeLikePattern(value: string) {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

function pricesDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: "product_prices") => ReturnType<Supabase["from"]>;
  };
}

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

export type StockLevelsSummary = {
  totalValue: number;
  totalRetailValue: number;
  lineCount: number;
  skusWithQty: number;
  lowStockCount: number;
  outOfStockCount: number;
};

export type StockLevelsPage = {
  rows: StockLevelRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  summary: StockLevelsSummary;
  categories: { id: string; name: string }[];
};

export type StockLevelsPageInput = {
  outletId?: string | null;
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
  status?: StockStatus | "all";
};

function stockStatus(qty: number, reorder: number): StockStatus {
  if (qty <= 0) return "out_of_stock";
  if (reorder > 0 && qty <= reorder) return "low";
  return "ok";
}

async function fetchOutletStockMap(
  supabase: Supabase,
  organizationId: string,
  outletId: string
) {
  const rows = await fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from("stock")
      .select("product_id, quantity, cost_price")
      .eq("organization_id", organizationId)
      .eq("outlet_id", outletId)
      .range(from, to);
    return { data, error };
  });
  const map = new Map<string, { quantity: number; cost_price: number }>();
  for (const row of rows) {
    map.set(row.product_id, {
      quantity: Number(row.quantity),
      cost_price: Number(row.cost_price),
    });
  }
  return map;
}

async function fetchRetailPriceMap(
  supabase: Supabase,
  productIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!productIds.length) return map;
  const prices = await fetchByInChunks(productIds, async (chunk) => {
    const { data, error } = await pricesDb(supabase)
      .from("product_prices")
      .select("product_id, price")
      .in("product_id", chunk)
      .eq("price_type", "retail")
      .is("effective_to", null);
    return { data, error };
  });
  for (const p of prices as { product_id: string; price: number }[]) {
    if (!map.has(p.product_id)) {
      map.set(p.product_id, Number(p.price));
    }
  }
  return map;
}

async function fetchVelocityMap(
  supabase: Supabase,
  outletId: string,
  onlyProductIds?: Set<string>
) {
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
    p_outlet_id: outletId,
    p_days: 30,
  });
  if (velErr) throw new Error(velErr.message);
  for (const row of velocityRows ?? []) {
    const pid = row.product_id as string;
    if (onlyProductIds && !onlyProductIds.has(pid)) continue;
    velocity.set(pid, Number(row.qty) || 0);
  }
  return velocity;
}

function toStockLevelRow(
  product: ProductLite,
  outletId: string,
  outletName: string,
  categoryNameById: Map<string, string>,
  stockMap: Map<string, { quantity: number; cost_price: number }>,
  retailMap: Map<string, number>,
  velocity: Map<string, number>
): StockLevelRow {
  const stock = stockMap.get(product.id);
  const qty = stock?.quantity ?? 0;
  const cost = stock?.cost_price ?? 0;
  const retail = retailMap.get(product.id) ?? 0;
  const reorder = Number(product.reorder_point ?? 0);
  const sold30 = velocity.get(product.id) ?? 0;
  const avgDaily = roundMoney(sold30 / 30);
  const daysOfCover =
    avgDaily > 0 ? Math.round((qty / avgDaily) * 10) / 10 : null;
  const targetQty = Math.max(reorder * 2, reorder);
  const suggested = Math.max(0, roundMoney(targetQty - qty));

  return {
    outlet_id: outletId,
    outlet_name: outletName,
    product_id: product.id,
    code: product.code,
    product_name: product.name,
    category_id: product.category_id,
    category_name: resolveCategoryName(product.category_id, categoryNameById),
    unit: product.unit,
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
}

async function enrichStockLevelRows(
  supabase: Supabase,
  products: ProductLite[],
  outletId: string,
  outletName: string,
  categoryNameById: Map<string, string>,
  stockMap: Map<string, { quantity: number; cost_price: number }>
): Promise<StockLevelRow[]> {
  if (!products.length) return [];
  const ids = products.map((p) => p.id);
  const idSet = new Set(ids);
  const [retailMap, velocity] = await Promise.all([
    fetchRetailPriceMap(supabase, ids),
    fetchVelocityMap(supabase, outletId, idSet),
  ]);
  return products.map((p) =>
    toStockLevelRow(
      p,
      outletId,
      outletName,
      categoryNameById,
      stockMap,
      retailMap,
      velocity
    )
  );
}

async function computeStockLevelsSummaryFast(
  supabase: Supabase,
  organizationId: string,
  outletId: string,
  stockMap: Map<string, { quantity: number; cost_price: number }>
): Promise<StockLevelsSummary> {
  const products = await fetchAllPaginated(async (from, to) => {
    const { data, error } = await supabase
      .from("products")
      .select("id, reorder_point")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .range(from, to);
    return { data, error };
  });

  let totalValue = 0;
  let skusWithQty = 0;
  const idsWithQty: string[] = [];
  for (const [, stock] of Array.from(stockMap.entries())) {
    if (stock.quantity > 0) {
      totalValue += stock.quantity * stock.cost_price;
      skusWithQty += 1;
    }
  }
  totalValue = roundMoney(totalValue);

  let lowStockCount = 0;
  let outOfStockCount = 0;
  for (const p of products) {
    const qty = stockMap.get(p.id)?.quantity ?? 0;
    const reorder = Number(p.reorder_point ?? 0);
    if (stockStatus(qty, reorder) === "low") lowStockCount += 1;
    if (qty <= 0 && reorder > 0) outOfStockCount += 1;
    if (qty > 0) idsWithQty.push(p.id);
  }

  const retailMap = await fetchRetailPriceMap(supabase, idsWithQty);
  let totalRetailValue = 0;
  for (const [productId, stock] of Array.from(stockMap.entries())) {
    if (stock.quantity > 0) {
      totalRetailValue += stock.quantity * (retailMap.get(productId) ?? 0);
    }
  }

  return {
    totalValue,
    totalRetailValue: roundMoney(totalRetailValue),
    lineCount: products.length,
    skusWithQty,
    lowStockCount,
    outOfStockCount,
  };
}

async function fetchFilteredProductLites(
  supabase: Supabase,
  organizationId: string,
  search: string,
  categoryId: string | null,
  categoryNameById: Map<string, string>
): Promise<ProductLite[]> {
  let matchingCategoryIds: string[] = [];
  if (search) {
    const needle = search.toLowerCase();
    matchingCategoryIds = Array.from(categoryNameById.entries())
      .filter(([, name]) => name.toLowerCase().includes(needle))
      .map(([id]) => id);
  }

  const rows = await fetchAllPaginated(async (from, to) => {
    let query = supabase
      .from("products")
      .select("id, name, code, unit, category_id, reorder_point")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (search) {
      const like = `%${escapeLikePattern(search)}%`;
      const clauses = [`name.ilike.${like}`, `code.ilike.${like}`];
      if (matchingCategoryIds.length > 0) {
        clauses.push(`category_id.in.(${matchingCategoryIds.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }

    const { data, error } = await query
      .order("name", { ascending: true })
      .range(from, to);
    return { data, error };
  });

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    unit: p.unit,
    category_id: p.category_id as string | null,
    reorder_point: Number(p.reorder_point ?? 0),
  }));
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

function normalizePage(input?: number) {
  return Math.max(1, Math.floor(Number(input) || 1));
}

function normalizePageSize(input?: number) {
  const n = Math.floor(Number(input) || 50);
  return Math.min(100, Math.max(10, n));
}

export async function listStockLevelsPage(
  input: StockLevelsPageInput = {}
): Promise<StockLevelsPage> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const filterOutlet = input.outletId ?? ctx.outletId;
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const search = input.search?.trim() ?? "";
  const categoryId =
    input.categoryId && input.categoryId !== "all" ? input.categoryId : null;
  const status =
    input.status && input.status !== "all" ? input.status : null;

  const empty: StockLevelsPage = {
    rows: [],
    page,
    pageSize,
    total: 0,
    hasMore: false,
    summary: {
      totalValue: 0,
      totalRetailValue: 0,
      lineCount: 0,
      skusWithQty: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    },
    categories: [],
  };

  if (!filterOutlet) return empty;

  const [{ data: categories, error: catErr }, outletRow, stockMap] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name")
        .eq("organization_id", ctx.organizationId),
      supabase
        .from("outlets")
        .select("id, name")
        .eq("id", filterOutlet)
        .maybeSingle(),
      fetchOutletStockMap(supabase, ctx.organizationId, filterOutlet),
    ]);
  if (catErr) throw new Error(catErr.message);

  const categoryNameById = new Map(
    (categories ?? []).map((c) => [c.id, c.name as string])
  );
  const categoryOptions = (categories ?? [])
    .map((c) => ({ id: c.id, name: c.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const outletName = outletRow.data?.name ?? "—";

  const summary = await computeStockLevelsSummaryFast(
    supabase,
    ctx.organizationId,
    filterOutlet,
    stockMap
  );

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let pageProducts: ProductLite[] = [];
  let total = 0;

  if (status) {
    const allMatching = await fetchFilteredProductLites(
      supabase,
      ctx.organizationId,
      search,
      categoryId,
      categoryNameById
    );
    const filtered = allMatching.filter((p) => {
      const qty = stockMap.get(p.id)?.quantity ?? 0;
      return stockStatus(qty, p.reorder_point) === status;
    });
    total = filtered.length;
    pageProducts = filtered.slice(from, from + pageSize);
  } else {
    let matchingCategoryIds: string[] = [];
    if (search) {
      const needle = search.toLowerCase();
      matchingCategoryIds = Array.from(categoryNameById.entries())
        .filter(([, name]) => name.toLowerCase().includes(needle))
        .map(([id]) => id);
    }

    let query = supabase
      .from("products")
      .select(
        "id, name, code, unit, category_id, reorder_point",
        { count: "exact" }
      )
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (search) {
      const like = `%${escapeLikePattern(search)}%`;
      const clauses = [`name.ilike.${like}`, `code.ilike.${like}`];
      if (matchingCategoryIds.length > 0) {
        clauses.push(`category_id.in.(${matchingCategoryIds.join(",")})`);
      }
      query = query.or(clauses.join(","));
    }

    const { data: products, error, count } = await query
      .order("name", { ascending: true })
      .range(from, to);
    if (error) throw new Error(error.message);

    pageProducts = (products ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      unit: p.unit,
      category_id: p.category_id as string | null,
      reorder_point: Number(p.reorder_point ?? 0),
    }));
    total = count ?? 0;
  }

  const rows = await enrichStockLevelRows(
    supabase,
    pageProducts,
    filterOutlet,
    outletName,
    categoryNameById,
    stockMap
  );

  return {
    rows,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
    summary,
    categories: categoryOptions,
  };
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
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const filterOutlet = outletId ?? ctx.outletId;
  if (!filterOutlet) {
    return {
      totalValue: 0,
      lineCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };
  }
  const stockMap = await fetchOutletStockMap(
    supabase,
    ctx.organizationId,
    filterOutlet
  );
  const summary = await computeStockLevelsSummaryFast(
    supabase,
    ctx.organizationId,
    filterOutlet,
    stockMap
  );
  return {
    totalValue: summary.totalValue,
    lineCount: summary.lineCount,
    lowStockCount: summary.lowStockCount,
    outOfStockCount: summary.outOfStockCount,
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
  newQuantity: number,
  reason?: string
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
    const reasonNote = reason?.trim();
    const qtyNote = reasonNote
      ? `Qty ${prevQty} → ${newQuantity}: ${reasonNote}`
      : `Qty adjusted ${prevQty} → ${newQuantity}`;

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
          notes: reasonNote
            ? `Opening stock set: ${reasonNote}`
            : "Stock quantity set",
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
          notes: qtyNote,
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
