"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listCategoriesForOrg } from "@/lib/actions/inventory";
import {
  type ProductUnitOption,
  defaultUnitsForProduct,
} from "@/lib/products/units";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchByInChunks } from "@/lib/supabase/query-chunks";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function unitsDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

function mapUnitRow(r: {
  id: string;
  unit_label: string;
  factor_to_base: number;
  is_base: boolean;
  units_per_base?: boolean | null;
  retail_price: number | null;
  wholesale_price: number | null;
  sort_order: number;
}): ProductUnitOption {
  return {
    id: String(r.id),
    unitLabel: String(r.unit_label),
    factorToBase: Number(r.factor_to_base),
    isBase: Boolean(r.is_base),
    unitsPerBase:
      r.units_per_base != null ? Boolean(r.units_per_base) : undefined,
    retailPrice: r.retail_price != null ? Number(r.retail_price) : null,
    wholesalePrice:
      r.wholesale_price != null ? Number(r.wholesale_price) : null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function withLegacyUnitDirectionInference(
  units: ProductUnitOption[]
): ProductUnitOption[] {
  const base = units.find((u) => u.isBase) ?? units[0];
  if (!base) return units;

  const baseRetail = base.retailPrice ?? base.wholesalePrice ?? 0;
  const baseWholesale = base.wholesalePrice ?? base.retailPrice ?? baseRetail;
  return units.map((unit) => {
    if (unit.isBase || unit.unitsPerBase || unit.factorToBase <= 1) {
      return unit;
    }
    const unitRetail = unit.retailPrice ?? unit.wholesalePrice ?? 0;
    const unitWholesale = unit.wholesalePrice ?? unit.retailPrice ?? unitRetail;
    const likelySmallerRetail =
      baseRetail > 0 && unitRetail > 0 && unitRetail < baseRetail;
    const likelySmallerWholesale =
      baseWholesale > 0 && unitWholesale > 0 && unitWholesale < baseWholesale;

    if (likelySmallerRetail || likelySmallerWholesale) {
      return { ...unit, unitsPerBase: true };
    }
    return unit;
  });
}

export async function listProductUnitsMap(
  productIds: string[]
): Promise<Record<string, ProductUnitOption[]>> {
  const out: Record<string, ProductUnitOption[]> = {};
  if (!productIds.length) return out;

  const supabase = await createServerSupabaseClient();
  let rows;
  try {
    rows = await fetchByInChunks(productIds, async (chunk) => {
      const { data, error } = await unitsDb(supabase)
        .from("product_units")
        .select(
          "id, product_id, unit_label, factor_to_base, is_base, units_per_base, retail_price, wholesale_price, sort_order"
        )
        .in("product_id", chunk)
        .order("sort_order")
        .order("unit_label");
      return { data, error };
    });
  } catch (e) {
    if (!(e instanceof Error) || !e.message.includes("units_per_base")) {
      throw e;
    }
    rows = await fetchByInChunks(productIds, async (chunk) => {
    const { data, error } = await unitsDb(supabase)
      .from("product_units")
      .select(
        "id, product_id, unit_label, factor_to_base, is_base, retail_price, wholesale_price, sort_order"
      )
      .in("product_id", chunk)
      .order("sort_order")
      .order("unit_label");
    return { data, error };
  });
  }

  for (const r of rows) {
    const row = r as {
      product_id: string;
      id: string;
      unit_label: string;
      factor_to_base: number;
      is_base: boolean;
      units_per_base?: boolean | null;
      retail_price: number | null;
      wholesale_price: number | null;
      sort_order: number;
    };
    const pid = String(row.product_id);
    if (!out[pid]) out[pid] = [];
    out[pid].push(mapUnitRow(row));
  }
  for (const [productId, units] of Object.entries(out)) {
    out[productId] = withLegacyUnitDirectionInference(units);
  }
  return out;
}

export type ProductEditDetail = {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  categoryId: string | null;
  retailPrice: number;
  wholesalePrice: number;
  units: ProductUnitOption[];
  categories: { id: string; name: string }[];
};

export async function getProductEditDetail(
  productId: string
): Promise<ProductEditDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, code, unit, category_id")
    .eq("id", productId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!product) return null;

  const [{ data: prices }, unitsMap, categories] = await Promise.all([
    supabase
      .from("product_prices")
      .select("price_type, price")
      .eq("product_id", productId)
      .is("effective_to", null),
    listProductUnitsMap([productId]),
    listCategoriesForOrg(),
  ]);

  let retail = 0;
  let wholesale = 0;
  for (const p of prices ?? []) {
    if (p.price_type === "retail") retail = Number(p.price);
    if (p.price_type === "wholesale") wholesale = Number(p.price);
  }
  if (!wholesale) wholesale = retail;

  let units = unitsMap[productId] ?? [];
  if (units.length === 0) {
    units = defaultUnitsForProduct(productId, product.unit, retail, wholesale);
  }

  return {
    id: product.id,
    name: product.name,
    code: product.code,
    unit: product.unit,
    categoryId: product.category_id,
    retailPrice: retail,
    wholesalePrice: wholesale,
    units,
    categories,
  };
}

const unitInput = z.object({
  id: z.string().uuid().optional(),
  unitLabel: z.string().min(1).max(40),
  factorToBase: z.number().positive(),
  isBase: z.boolean().default(false),
  unitsPerBase: z.boolean().default(false),
  retailPrice: z.number().nonnegative().nullable().optional(),
  wholesalePrice: z.number().nonnegative().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

const updateProductEditInput = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(200),
  categoryId: z.string().uuid().nullable(),
  units: z.array(unitInput).min(1).max(12),
});

export async function updateProductEdit(
  raw: z.infer<typeof updateProductEditInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = updateProductEditInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const baseUnits = input.units.filter((u) => u.isBase);
    if (baseUnits.length !== 1) {
      return {
        ok: false,
        message: "Mark exactly one unit as the base (stock) unit.",
      };
    }

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", input.productId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!product) return { ok: false, message: "Product not found." };

    const baseUnit = baseUnits[0]!;
    const normalizedUnits = input.units.map((u) => ({
      ...u,
      unitsPerBase: u.isBase ? false : u.unitsPerBase,
      factorToBase: u.isBase ? 1 : u.factorToBase,
    }));
    const { error: pErr } = await supabase
      .from("products")
      .update({
        name: input.name.trim(),
        category_id: input.categoryId,
        unit: baseUnit.unitLabel.trim(),
      })
      .eq("id", input.productId);
    if (pErr) return { ok: false, message: pErr.message };

    await syncProductUnits(supabase, input.productId, normalizedUnits);

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

/** Keep POS unit overrides aligned with catalog retail price updates. */
export async function syncBaseUnitRetailPrice(
  supabase: Supabase,
  productId: string,
  retailPrice: number
): Promise<void> {
  const { error } = await unitsDb(supabase)
    .from("product_units")
    .update({ retail_price: retailPrice })
    .eq("product_id", productId)
    .eq("is_base", true);
  if (error) throw new Error(error.message);
}

export async function ensureBaseProductUnit(
  supabase: Supabase,
  productId: string,
  baseUnit: string,
  retailPrice: number,
  wholesalePrice?: number
): Promise<void> {
  const { data: existing } = await unitsDb(supabase)
    .from("product_units")
    .select("id")
    .eq("product_id", productId)
    .eq("is_base", true)
    .maybeSingle();
  if (existing) return;

  await unitsDb(supabase).from("product_units").insert({
    product_id: productId,
    unit_label: baseUnit.trim(),
    factor_to_base: 1,
    is_base: true,
    units_per_base: false,
    retail_price: retailPrice,
    wholesale_price: wholesalePrice ?? retailPrice,
    sort_order: 0,
  });
}

async function syncProductUnits(
  supabase: Supabase,
  productId: string,
  units: z.infer<typeof unitInput>[]
): Promise<void> {
  const { data: existing } = await unitsDb(supabase)
    .from("product_units")
    .select("id")
    .eq("product_id", productId);

  const keepIds = new Set(
    units.map((u) => u.id).filter((id): id is string => !!id)
  );
  const toDelete = (existing ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id: string) => !keepIds.has(id));
  if (toDelete.length > 0) {
    await unitsDb(supabase).from("product_units").delete().in("id", toDelete);
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const row = {
      product_id: productId,
      unit_label: u.unitLabel.trim(),
      factor_to_base: u.factorToBase,
      is_base: u.isBase,
      units_per_base: u.isBase ? false : u.unitsPerBase,
      retail_price: u.retailPrice ?? null,
      wholesale_price: u.wholesalePrice ?? null,
      sort_order: u.sortOrder ?? i,
    };
    if (u.id) {
      await unitsDb(supabase).from("product_units").update(row).eq("id", u.id);
    } else {
      await unitsDb(supabase).from("product_units").insert(row);
    }
  }
}
