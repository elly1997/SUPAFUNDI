"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  compareByCategoryThenName,
  resolveCategoryName,
} from "@/lib/products/catalog-grouping";
import { normalizeProductName } from "@/lib/products/product-name";
import { getOrgRetailMarginPct } from "@/lib/pricing/org-retail-margin";
import { generateProductCode } from "@/lib/products/sku";
import { requireOrgContext } from "@/lib/server/org-context";
import { applyMissingRetailPricesCore } from "@/lib/inventory/apply-missing-retail-prices";
import { upsertRetailPrice } from "@/lib/inventory/product-prices";
import { retailPriceFromCost } from "@/lib/utils/calculations";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";

const createProductInput = z.object({
  name: z.string().min(1).max(500),
  categoryId: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.string().uuid().nullable()
  ),
  categoryName: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).default("pcs"),
  code: z.string().max(120).optional(),
  retailPrice: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().nonnegative(),
  outletId: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductInput>;

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ProductPriceRow = {
  product_id: string;
  price: number;
  auto_generated?: boolean;
};

async function resolveCatalogOutletId(
  requestedOutletId: string | null | undefined
): Promise<{ organizationId: string; outletId: string; userId: string }> {
  const ctx = await requireOrgContext();
  const outletId = requestedOutletId ?? ctx.outletId;
  if (!outletId) {
    throw new Error("Select an active outlet first.");
  }
  return {
    organizationId: ctx.organizationId,
    outletId,
    userId: ctx.userId,
  };
}

function pricesDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

function catalogDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

async function ensureCategory(
  supabase: Supabase,
  organizationId: string,
  categoryId: string | null,
  categoryName: string | undefined
): Promise<string> {
  if (categoryId) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!cat?.id) {
      throw new Error("Invalid category for this organization.");
    }
    return cat.id;
  }
  if (!categoryName?.trim()) {
    throw new Error("Category is required.");
  }
  const name = categoryName.trim();
  const { data: list, error: listErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", organizationId);
  if (listErr) {
    throw new Error(listErr.message);
  }
  const match = list?.find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (match) {
    return match.id;
  }
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ organization_id: organizationId, name })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? "Could not create category.");
  }
  return created.id;
}

export async function createProduct(
  raw: CreateProductInput
): Promise<
  { ok: true; productId: string; code: string } | { ok: false; message: string }
> {
  try {
    const input = createProductInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: outlet } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, message: "Invalid outlet for your organization." };
    }

    let code = input.code?.trim() || generateProductCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const categoryId = await ensureCategory(
        supabase,
        ctx.organizationId,
        input.categoryId,
        input.categoryName
      );

      const { data: existing } = await catalogDb(supabase)
        .from("products")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", input.outletId)
        .eq("code", code)
        .maybeSingle();

      if (existing?.id) {
        return { ok: false, message: `Product code "${code}" already exists.` };
      }

      const { data: allNames } = await catalogDb(supabase)
        .from("products")
        .select("id, name")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", input.outletId);
      const nameKey = normalizeProductName(input.name);
      const nameClash = ((allNames ?? []) as { id: string; name: string }[]).find(
        (p) => normalizeProductName(p.name) === nameKey
      );
      if (nameClash) {
        return {
          ok: false,
          message: `Product name "${input.name.trim()}" already exists.`,
        };
      }

      const { data: product, error: pErr } = await catalogDb(supabase)
        .from("products")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: input.outletId,
          category_id: categoryId,
          name: input.name.trim(),
          unit: input.unit.trim(),
          code,
          is_active: true,
          reorder_point: 0,
        })
        .select("id")
        .single();

      if (pErr) {
        if (pErr.code === "23505" && attempt < 4) {
          code = generateProductCode();
          continue;
        }
        return { ok: false, message: pErr.message };
      }
      if (!product) {
        return { ok: false, message: "Insert failed." };
      }

      const marginPct = await getOrgRetailMarginPct();
      const retail =
        input.retailPrice > 0
          ? input.retailPrice
          : retailPriceFromCost(input.costPrice, marginPct);
      await upsertRetailPrice(supabase, product.id, retail, {
        autoGenerated: input.retailPrice <= 0 && retail > 0,
      });

      const { ensureBaseProductUnit } = await import(
        "@/lib/actions/product-units"
      );
      await ensureBaseProductUnit(
        supabase,
        product.id,
        input.unit.trim(),
        input.retailPrice,
        input.retailPrice
      );

      const { error: sErr } = await supabase.from("stock").upsert(
        {
          organization_id: ctx.organizationId,
          outlet_id: input.outletId,
          product_id: product.id,
          quantity: input.quantity,
          cost_price: input.costPrice,
        },
        { onConflict: "outlet_id,product_id" }
      );
      if (sErr) {
        return { ok: false, message: sErr.message };
      }

      if (input.quantity > 0) {
        await supabase.from("stock_movements").insert({
          organization_id: ctx.organizationId,
          outlet_id: input.outletId,
          product_id: product.id,
          movement_type: "opening",
          quantity: input.quantity,
          unit_cost: input.costPrice,
          reference_type: "product_create",
          notes: "Initial stock on product create",
          created_by: ctx.userId,
        });
      }

      revalidatePath("/inventory/products");
      revalidatePath("/inventory/receive");
      revalidatePath("/inventory/stock");
      revalidatePath("/pos");
      return { ok: true, productId: product.id, code };
    }
    return { ok: false, message: "Could not allocate a unique product code." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { ok: false, message };
  }
}

export type { ImportInventoryResult } from "@/lib/inventory/run-import";

export async function importInventoryRows(
  outletId: string,
  rows: InventoryImportRow[]
): Promise<import("@/lib/inventory/run-import").ImportInventoryResult> {
  const ctx = await requireOrgContext();
  const { runInventoryImport } = await import("@/lib/inventory/run-import");
  const result = await runInventoryImport(
    ctx.organizationId,
    outletId,
    rows
  );
  revalidatePath("/inventory/products");
  revalidatePath("/inventory/stock");
  return result;
}

const adjustProductStockInput = z
  .object({
    productId: z.string().uuid(),
    outletId: z.string().uuid(),
    quantity: z.coerce.number().nonnegative().optional(),
    costPrice: z.coerce.number().nonnegative().optional(),
    retailPrice: z.coerce.number().nonnegative().optional(),
    unit: z.string().min(1).max(50).optional(),
  })
  .refine(
    (d) =>
      d.quantity !== undefined ||
      d.costPrice !== undefined ||
      d.retailPrice !== undefined ||
      d.unit !== undefined,
    { message: "Change at least one field." }
  );

export type AdjustProductStockInput = z.infer<typeof adjustProductStockInput>;

export async function adjustProductStock(
  raw: AdjustProductStockInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = adjustProductStockInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: product } = await catalogDb(supabase)
      .from("products")
      .select("id")
      .eq("id", input.productId)
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", input.outletId)
      .maybeSingle();
    if (!product) {
      return { ok: false, message: "Product not found." };
    }

    const { data: outlet } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, message: "Invalid outlet." };
    }

    if (input.unit !== undefined) {
      const { error } = await supabase
        .from("products")
        .update({ unit: input.unit.trim() })
        .eq("id", input.productId);
      if (error) return { ok: false, message: error.message };
    }

    if (input.retailPrice !== undefined) {
      await upsertRetailPrice(supabase, input.productId, input.retailPrice);
    }

    if (input.quantity !== undefined || input.costPrice !== undefined) {
      const { data: existingStock } = await supabase
        .from("stock")
        .select("quantity, cost_price")
        .eq("outlet_id", input.outletId)
        .eq("product_id", input.productId)
        .maybeSingle();

      const { error: sErr } = await supabase.from("stock").upsert(
        {
          organization_id: ctx.organizationId,
          outlet_id: input.outletId,
          product_id: input.productId,
          quantity: input.quantity ?? Number(existingStock?.quantity ?? 0),
          cost_price:
            input.costPrice ?? Number(existingStock?.cost_price ?? 0),
        },
        { onConflict: "outlet_id,product_id" }
      );
      if (sErr) return { ok: false, message: sErr.message };
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    revalidatePath("/pos");
    revalidatePath("/reports");
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return { ok: false, message };
  }
}

export async function getProductStockSnapshot(
  productId: string,
  outletId: string
): Promise<{
  quantity: number;
  costPrice: number;
  retailPrice: number | null;
  unit: string;
} | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: product } = await catalogDb(supabase)
    .from("products")
    .select("id, unit")
    .eq("id", productId)
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .maybeSingle();
  if (!product) return null;

  const [{ data: stock }, { data: price }] = await Promise.all([
    supabase
      .from("stock")
      .select("quantity, cost_price")
      .eq("outlet_id", outletId)
      .eq("product_id", productId)
      .maybeSingle(),
    supabase
      .from("product_prices")
      .select("price")
      .eq("product_id", productId)
      .eq("price_type", "retail")
      .is("effective_to", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    quantity: Number(stock?.quantity ?? 0),
    costPrice: Number(stock?.cost_price ?? 0),
    retailPrice: price?.price != null ? Number(price.price) : null,
    unit: product.unit,
  };
}

export type ProductPriceCatalogRow = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string;
  costPrice: number;
  /** Quantity on hand at the requested outlet (0 if none). */
  stockQty: number;
  /** null when no retail price row exists */
  retailPrice: number | null;
  retailAutoGenerated: boolean;
};

export type ProductPriceCatalogPage = {
  products: ProductPriceCatalogRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type ProductPriceCatalogPageInput = {
  outletId?: string | null;
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
};

export async function listProductPriceCatalog(
  outletId?: string | null
): Promise<ProductPriceCatalogRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const costOutletId = outletId ?? ctx.outletId;
  if (!costOutletId) return [];

  const [products, categoriesRes] = await Promise.all([
    fetchAllPaginated(async (from, to) => {
      const { data, error } = await catalogDb(supabase)
        .from("products")
        .select("id, name, code, unit, category_id")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", costOutletId)
        .eq("is_active", true)
        .range(from, to);
      return { data, error };
    }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("organization_id", ctx.organizationId),
  ]);
  if (categoriesRes.error) {
    throw new Error(categoriesRes.error.message);
  }
  type CatalogProduct = {
    id: string;
    name: string;
    code: string | null;
    unit: string;
    category_id: string | null;
  };
  const productRows = (products ?? []) as CatalogProduct[];
  if (!productRows.length) return [];

  const categoryNameById = new Map(
    (categoriesRes.data ?? []).map((c) => [c.id, c.name as string])
  );
  const ids = productRows.map((p) => p.id);
  const [prices, stockRows] = await Promise.all([
    fetchByInChunks(ids, async (chunk) => {
      const { data, error } = await pricesDb(supabase)
        .from("product_prices")
        .select("product_id, price, auto_generated")
        .in("product_id", chunk)
        .eq("price_type", "retail")
        .is("effective_to", null);
      return { data, error };
    }),
    costOutletId
      ? fetchByInChunks(ids, async (chunk) => {
          const { data, error } = await supabase
            .from("stock")
            .select("product_id, cost_price, quantity")
            .eq("outlet_id", costOutletId)
            .in("product_id", chunk);
          return { data, error };
        })
      : Promise.resolve(
          [] as { product_id: string; cost_price: number; quantity: number }[]
        ),
  ]);

  const retailMap = new Map<
    string,
    { price: number; autoGenerated: boolean }
  >();
  for (const p of (prices ?? []) as ProductPriceRow[]) {
    if (!retailMap.has(p.product_id)) {
      retailMap.set(p.product_id, {
        price: Number(p.price),
        autoGenerated: Boolean(p.auto_generated),
      });
    }
  }
  const costMap = new Map<string, number>();
  const qtyMap = new Map<string, number>();
  for (const s of stockRows) {
    costMap.set(s.product_id, Number(s.cost_price));
    qtyMap.set(s.product_id, Number(s.quantity));
  }

  const rows: ProductPriceCatalogRow[] = productRows.map((p) => {
    const retail = retailMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      unit: p.unit,
      categoryId: p.category_id as string | null,
      categoryName: resolveCategoryName(
        p.category_id as string | null,
        categoryNameById
      ),
      costPrice: costMap.get(p.id) ?? 0,
      stockQty: qtyMap.get(p.id) ?? 0,
      retailPrice: retail ? retail.price : null,
      retailAutoGenerated: retail?.autoGenerated ?? false,
    };
  });

  return rows.sort(compareByCategoryThenName);
}

function normalizePage(input?: number) {
  return Math.max(1, Math.floor(Number(input) || 1));
}

function normalizePageSize(input?: number) {
  const n = Math.floor(Number(input) || 50);
  return Math.min(100, Math.max(10, n));
}

function escapeLikePattern(value: string) {
  return value.replace(/[%_]/g, (m) => `\\${m}`);
}

async function buildCatalogRows(
  supabase: Supabase,
  products: {
    id: string;
    name: string;
    code: string | null;
    unit: string;
    category_id: string | null;
  }[],
  categoryNameById: Map<string, string>,
  costOutletId?: string | null
): Promise<ProductPriceCatalogRow[]> {
  if (!products.length) return [];

  const ids = products.map((p) => p.id);
  const [prices, stockRows] = await Promise.all([
    fetchByInChunks(ids, async (chunk) => {
      const { data, error } = await pricesDb(supabase)
        .from("product_prices")
        .select("product_id, price, auto_generated")
        .in("product_id", chunk)
        .eq("price_type", "retail")
        .is("effective_to", null);
      return { data, error };
    }),
    costOutletId
      ? fetchByInChunks(ids, async (chunk) => {
          const { data, error } = await supabase
            .from("stock")
            .select("product_id, cost_price, quantity")
            .eq("outlet_id", costOutletId)
            .in("product_id", chunk);
          return { data, error };
        })
      : Promise.resolve(
          [] as { product_id: string; cost_price: number; quantity: number }[]
        ),
  ]);

  const retailMap = new Map<
    string,
    { price: number; autoGenerated: boolean }
  >();
  for (const p of (prices ?? []) as ProductPriceRow[]) {
    if (!retailMap.has(p.product_id)) {
      retailMap.set(p.product_id, {
        price: Number(p.price),
        autoGenerated: Boolean(p.auto_generated),
      });
    }
  }
  const costMap = new Map<string, number>();
  const qtyMap = new Map<string, number>();
  for (const s of stockRows) {
    costMap.set(s.product_id, Number(s.cost_price));
    qtyMap.set(s.product_id, Number(s.quantity));
  }

  return products.map((p) => {
    const retail = retailMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      unit: p.unit,
      categoryId: p.category_id,
      categoryName: resolveCategoryName(p.category_id, categoryNameById),
      costPrice: costMap.get(p.id) ?? 0,
      stockQty: qtyMap.get(p.id) ?? 0,
      retailPrice: retail ? retail.price : null,
      retailAutoGenerated: retail?.autoGenerated ?? false,
    };
  });
}

export async function listProductPriceCatalogPage(
  input: ProductPriceCatalogPageInput = {}
): Promise<ProductPriceCatalogPage> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const costOutletId = input.outletId ?? ctx.outletId;
  if (!costOutletId) {
    return {
      products: [],
      page: 1,
      pageSize: normalizePageSize(input.pageSize),
      total: 0,
      hasMore: false,
    };
  }
  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const search = input.search?.trim() ?? "";
  const categoryId =
    input.categoryId && input.categoryId !== "all" ? input.categoryId : null;

  const { data: categories, error: catErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", ctx.organizationId);
  if (catErr) throw new Error(catErr.message);
  const categoryNameById = new Map(
    (categories ?? []).map((c) => [c.id, c.name as string])
  );

  let matchingCategoryIds: string[] = [];
  if (search) {
    const needle = search.toLowerCase();
    matchingCategoryIds = (categories ?? [])
      .filter((c) => String(c.name).toLowerCase().includes(needle))
      .map((c) => c.id);
  }

  let query = catalogDb(supabase)
    .from("products")
    .select("id, name, code, unit, category_id", { count: "exact" })
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", costOutletId)
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

  const rows = await buildCatalogRows(
    supabase,
    (products ?? []) as {
      id: string;
      name: string;
      code: string | null;
      unit: string;
      category_id: string | null;
    }[],
    categoryNameById,
    costOutletId
  );

  const total = count ?? 0;
  return {
    products: rows,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}

/** Set retail from cost × org margin for products with no retail price (cost &gt; 0). */
export async function applyMissingRetailPrices(
  outletId?: string | null
): Promise<
  | { ok: true; updated: number; marginPct: number }
  | { ok: false; message: string }
> {
  const result = await applyMissingRetailPricesCore(outletId);
  if (result.ok) {
    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    revalidatePath("/reports");
    revalidatePath("/pos");
  }
  return result;
}

const catalogPatchInput = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid().optional(),
  field: z.enum(["code", "unit", "costPrice", "retailPrice"]),
  value: z.union([z.string(), z.number()]),
  reason: z.string().max(500).optional(),
});

export async function patchProductCatalogField(
  raw: z.infer<typeof catalogPatchInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = catalogPatchInput.parse(raw);
    const { organizationId, outletId, userId } = await resolveCatalogOutletId(
      input.outletId ?? null
    );
    const supabase = await createServerSupabaseClient();

    const { data: product } = await catalogDb(supabase)
      .from("products")
      .select("id, name, code")
      .eq("id", input.productId)
      .eq("organization_id", organizationId)
      .eq("outlet_id", outletId)
      .maybeSingle();
    if (!product) return { ok: false, message: "Product not found." };

    if (input.field === "code") {
      const code = String(input.value).trim();
      if (!code) return { ok: false, message: "Code cannot be empty." };
      const { data: clash } = await catalogDb(supabase)
        .from("products")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("outlet_id", outletId)
        .eq("code", code)
        .neq("id", input.productId)
        .maybeSingle();
      if (clash) return { ok: false, message: `Code "${code}" is already used.` };
      const { error } = await catalogDb(supabase)
        .from("products")
        .update({ code })
        .eq("id", input.productId);
      if (error) return { ok: false, message: error.message };
    } else if (input.field === "unit") {
      const unit = String(input.value).trim();
      if (!unit) return { ok: false, message: "Unit cannot be empty." };
      const { error } = await catalogDb(supabase)
        .from("products")
        .update({ unit })
        .eq("id", input.productId);
      if (error) return { ok: false, message: error.message };
    } else if (input.field === "retailPrice") {
      const price = Number(input.value);
      if (!Number.isFinite(price) || price < 0) {
        return { ok: false, message: "Invalid retail price." };
      }
      const { data: prevPrice } = await pricesDb(supabase)
        .from("product_prices")
        .select("price")
        .eq("product_id", input.productId)
        .eq("price_type", "retail")
        .is("effective_to", null)
        .maybeSingle();
      const prevRetail = Number(prevPrice?.price ?? 0);
      await upsertRetailPrice(supabase, input.productId, price, {
        autoGenerated: false,
      });
      if (input.reason?.trim() || prevRetail !== price) {
        await supabase.from("stock_movements").insert({
          organization_id: organizationId,
          outlet_id: outletId,
          product_id: input.productId,
          movement_type: "adjustment_in",
          quantity: 0,
          unit_cost: price,
          reference_type: "price_adjustment",
          notes: input.reason?.trim()
            ? `Retail ${prevRetail} → ${price}: ${input.reason.trim()}`
            : `Retail price ${prevRetail} → ${price}`,
          created_by: userId,
        });
      }
    } else if (input.field === "costPrice") {
      const cost = Number(input.value);
      if (!Number.isFinite(cost) || cost < 0) {
        return { ok: false, message: "Invalid cost price." };
      }
      const { data: stock } = await supabase
        .from("stock")
        .select("id, quantity, cost_price")
        .eq("outlet_id", outletId)
        .eq("product_id", input.productId)
        .maybeSingle();
      const prevCost = Number(stock?.cost_price ?? 0);
      const { error } = await supabase.from("stock").upsert(
        {
          organization_id: organizationId,
          outlet_id: outletId,
          product_id: input.productId,
          quantity: Number(stock?.quantity ?? 0),
          cost_price: cost,
        },
        { onConflict: "outlet_id,product_id" }
      );
      if (error) return { ok: false, message: error.message };
      if (input.reason?.trim() || prevCost !== cost) {
        await supabase.from("stock_movements").insert({
          organization_id: organizationId,
          outlet_id: outletId,
          product_id: input.productId,
          movement_type: "adjustment_in",
          quantity: 0,
          unit_cost: cost,
          reference_type: "price_adjustment",
          notes: input.reason?.trim()
            ? `Cost ${prevCost} → ${cost}: ${input.reason.trim()}`
            : `Buying price ${prevCost} → ${cost}`,
          created_by: userId,
        });
      }
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    revalidatePath("/pos");
    revalidatePath("/reports");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

export async function listOutletsForOrg(): Promise<
  { id: string; name: string; code: string | null; is_default: boolean }[]
> {
  const ctx = await requireOrgContext();
  const { loadOrgOutlets, outletsForOperations } = await import(
    "@/lib/data/org-outlets"
  );
  const outlets = outletsForOperations(
    await loadOrgOutlets(ctx.organizationId)
  );
  return outlets.map(({ id, name, code, is_default }) => ({
    id,
    name,
    code,
    is_default,
  }));
}

export async function listCategoriesForOrg(): Promise<
  { id: string; name: string }[]
> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}
