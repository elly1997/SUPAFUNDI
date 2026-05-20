import "server-only";

import { z } from "zod";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";
import { normalizeProductName } from "@/lib/products/product-name";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const importRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().nonnegative(),
  cost: z.number().nonnegative().optional(),
  retailPrice: z.number().nonnegative().optional(),
  unit: z.string().min(1),
  notes: z.string().optional(),
});

export type ImportInventoryResult = {
  imported: number;
  updated: number;
  errors: { code: string; message: string }[];
};

async function upsertRetailPrice(
  supabase: Supabase,
  productId: string,
  price: number
): Promise<void> {
  const { data: row } = await supabase
    .from("product_prices")
    .select("id")
    .eq("product_id", productId)
    .eq("price_type", "retail")
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row?.id) {
    const { error } = await supabase
      .from("product_prices")
      .update({ price })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase.from("product_prices").insert({
    product_id: productId,
    price_type: "retail",
    price,
    min_qty: 1,
  });
  if (error) throw new Error(error.message);
}

function resolveCategoryId(
  cache: Map<string, string>,
  categoryName: string
): string | null {
  return cache.get(categoryName.trim().toLowerCase()) ?? null;
}

export async function runInventoryImport(
  organizationId: string,
  outletId: string,
  rows: InventoryImportRow[]
): Promise<ImportInventoryResult> {
  const supabase = await createServerSupabaseClient();

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id")
    .eq("id", outletId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!outlet) {
    return {
      imported: 0,
      updated: 0,
      errors: [
        { code: "-", message: "Invalid outlet for your organization." },
      ],
    };
  }

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", organizationId);
  const categoryCache = new Map<string, string>();
  for (const c of categories ?? []) {
    categoryCache.set(c.name.trim().toLowerCase(), c.id);
  }

  const { data: existingProducts } = await supabase
    .from("products")
    .select("id, code, name")
    .eq("organization_id", organizationId);

  const byCode = new Map<string, { id: string; name: string }>();
  const byName = new Map<string, { id: string; code: string | null }>();
  for (const p of existingProducts ?? []) {
    if (p.code) byCode.set(p.code.trim().toUpperCase(), { id: p.id, name: p.name });
    byName.set(normalizeProductName(p.name), {
      id: p.id,
      code: p.code,
    });
  }

  const errors: { code: string; message: string }[] = [];
  let imported = 0;
  let updated = 0;

  for (const raw of rows) {
    const row = importRowSchema.safeParse({
      code: raw.code,
      name: raw.name,
      category: raw.category,
      quantity: raw.quantity,
      cost: raw.cost,
      retailPrice: raw.retailPrice,
      unit: raw.unit,
      notes: raw.notes,
    });
    if (!row.success) {
      errors.push({
        code: raw.code ?? "?",
        message: row.error.issues.map((i) => i.message).join(", "),
      });
      continue;
    }
    const r = row.data;
    try {
      let categoryId = resolveCategoryId(categoryCache, r.category);
      if (!categoryId) {
        const name = r.category.trim();
        const { data: created, error: cErr } = await supabase
          .from("categories")
          .insert({ organization_id: organizationId, name })
          .select("id")
          .single();
        if (cErr || !created) {
          throw new Error(cErr?.message ?? "Could not create category.");
        }
        categoryId = created.id;
        categoryCache.set(name.toLowerCase(), categoryId);
      }

      const nameKey = normalizeProductName(r.name);
      const codeKey = r.code.trim().toUpperCase();
      const existingByCode = byCode.get(codeKey);
      const existingByName = byName.get(nameKey);

      if (
        existingByName &&
        (!existingByCode || existingByName.id !== existingByCode.id)
      ) {
        throw new Error(
          `Product name "${r.name}" already exists (code ${existingByName.code ?? "—"}). Use the same code to update stock only.`
        );
      }

      let productId: string;
      const description = r.notes?.trim() || null;

      if (existingByCode?.id) {
        productId = existingByCode.id;
        const { error: uErr } = await supabase
          .from("products")
          .update({
            name: r.name.trim(),
            category_id: categoryId,
            unit: r.unit.trim(),
            is_active: true,
            ...(description ? { description } : {}),
          })
          .eq("id", productId);
        if (uErr) throw new Error(uErr.message);
        updated += 1;
      } else {
        const { data: product, error: pErr } = await supabase
          .from("products")
          .insert({
            organization_id: organizationId,
            category_id: categoryId,
            name: r.name.trim(),
            unit: r.unit.trim(),
            code: r.code,
            is_active: true,
            reorder_point: 0,
            description,
          })
          .select("id")
          .single();
        if (pErr || !product) {
          throw new Error(pErr?.message ?? "Insert failed");
        }
        productId = product.id;
        imported += 1;
        byCode.set(codeKey, { id: productId, name: r.name });
        byName.set(nameKey, { id: productId, code: r.code });
      }

      if (r.retailPrice !== undefined) {
        await upsertRetailPrice(supabase, productId, r.retailPrice);
      }

      const { data: existingStock } = await supabase
        .from("stock")
        .select("id, cost_price")
        .eq("outlet_id", outletId)
        .eq("product_id", productId)
        .maybeSingle();

      if (existingStock?.id) {
        const patch: { quantity: number; cost_price?: number } = {
          quantity: r.quantity,
        };
        if (r.cost !== undefined) patch.cost_price = r.cost;
        const { error: sErr } = await supabase
          .from("stock")
          .update(patch)
          .eq("id", existingStock.id);
        if (sErr) throw new Error(sErr.message);
      } else {
        const { error: sErr } = await supabase.from("stock").insert({
          organization_id: organizationId,
          outlet_id: outletId,
          product_id: productId,
          quantity: r.quantity,
          cost_price: r.cost ?? 0,
        });
        if (sErr) throw new Error(sErr.message);
      }
    } catch (e) {
      errors.push({
        code: r.code,
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return { imported, updated, errors };
}
