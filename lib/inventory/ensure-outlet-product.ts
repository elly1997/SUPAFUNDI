import "server-only";

import { normalizeProductName } from "@/lib/products/product-name";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type SourceProduct = {
  id: string;
  name: string;
  code: string | null;
  barcode: string | null;
  category_id: string | null;
  description: string | null;
  unit: string;
  reorder_point: number | null;
  image_url: string | null;
  is_active: boolean;
};

function catalogDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

async function findDestinationProduct(
  supabase: Supabase,
  organizationId: string,
  toOutletId: string,
  source: SourceProduct
): Promise<string | null> {
  const db = catalogDb(supabase);
  const code = source.code?.trim();
  if (code) {
    const { data } = await db
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("outlet_id", toOutletId)
      .eq("code", code)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const barcode = source.barcode?.trim();
  if (barcode) {
    const { data } = await db
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("outlet_id", toOutletId)
      .eq("barcode", barcode)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: named } = await db
    .from("products")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("outlet_id", toOutletId);
  const key = normalizeProductName(source.name);
  const match = (named ?? []).find(
    (p: { id: string; name: string }) => normalizeProductName(p.name) === key
  );
  return match?.id ?? null;
}

async function cloneProductToOutlet(
  supabase: Supabase,
  organizationId: string,
  toOutletId: string,
  source: SourceProduct
): Promise<string> {
  const db = catalogDb(supabase);
  const { data: product, error } = await db
    .from("products")
    .insert({
      organization_id: organizationId,
      outlet_id: toOutletId,
      category_id: source.category_id,
      name: source.name,
      code: source.code,
      barcode: source.barcode,
      description: source.description,
      unit: source.unit,
      reorder_point: source.reorder_point ?? 0,
      image_url: source.image_url,
      is_active: source.is_active,
      supplier_id: null,
    })
    .select("id")
    .single();
  if (error || !product) {
    throw new Error(error?.message ?? "Could not copy product to destination.");
  }

  const { data: prices } = await db
    .from("product_prices")
    .select("price_type, price, min_qty, auto_generated")
    .eq("product_id", source.id)
    .is("effective_to", null);
  if (prices?.length) {
    const { error: priceErr } = await db.from("product_prices").insert(
      prices.map((p: {
        price_type: string;
        price: number;
        min_qty: number;
        auto_generated?: boolean;
      }) => ({
        product_id: product.id,
        price_type: p.price_type,
        price: p.price,
        min_qty: p.min_qty ?? 1,
        auto_generated: p.auto_generated ?? false,
      }))
    );
    if (priceErr) throw new Error(priceErr.message);
  }

  const { data: units } = await db
    .from("product_units")
    .select(
      "unit_label, factor_to_base, is_base, units_per_base, retail_price, wholesale_price, sort_order"
    )
    .eq("product_id", source.id);
  if (units?.length) {
    const { error: unitErr } = await db.from("product_units").insert(
      units.map((u: {
        unit_label: string;
        factor_to_base: number;
        is_base: boolean;
        units_per_base?: boolean | null;
        retail_price: number | null;
        wholesale_price: number | null;
        sort_order: number;
      }) => ({
        product_id: product.id,
        unit_label: u.unit_label,
        factor_to_base: u.factor_to_base,
        is_base: u.is_base,
        units_per_base: u.units_per_base ?? false,
        retail_price: u.retail_price,
        wholesale_price: u.wholesale_price,
        sort_order: u.sort_order,
      }))
    );
    if (unitErr) throw new Error(unitErr.message);
  }

  return product.id;
}

/** Match dest catalog by SKU, barcode, then name; otherwise copy the source item. */
export async function ensureDestinationProduct(
  supabase: Supabase,
  params: {
    organizationId: string;
    sourceProductId: string;
    toOutletId: string;
  }
): Promise<string> {
  const db = catalogDb(supabase);
  const { data: source, error } = await db
    .from("products")
    .select(
      "id, name, code, barcode, category_id, description, unit, reorder_point, image_url, is_active"
    )
    .eq("id", params.sourceProductId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (error || !source) {
    throw new Error("Source product was not found for this transfer line.");
  }

  const existing = await findDestinationProduct(
    supabase,
    params.organizationId,
    params.toOutletId,
    source as SourceProduct
  );
  if (existing) return existing;

  return cloneProductToOutlet(
    supabase,
    params.organizationId,
    params.toOutletId,
    source as SourceProduct
  );
}
