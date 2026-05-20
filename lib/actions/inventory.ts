"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateProductCode } from "@/lib/products/sku";
import { requireOrgContext } from "@/lib/server/org-context";
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

export async function createProduct(
  raw: CreateProductInput
): Promise<{ ok: true; productId: string } | { ok: false; message: string }> {
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

      const { data: existing } = await supabase
        .from("products")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("code", code)
        .maybeSingle();

      if (existing?.id) {
        return { ok: false, message: `Product code "${code}" already exists.` };
      }

      const { data: product, error: pErr } = await supabase
        .from("products")
        .insert({
          organization_id: ctx.organizationId,
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

      await upsertRetailPrice(supabase, product.id, input.retailPrice);

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

      revalidatePath("/inventory/products");
      return { ok: true, productId: product.id };
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

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", input.productId)
      .eq("organization_id", ctx.organizationId)
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

  const { data: product } = await supabase
    .from("products")
    .select("id, unit")
    .eq("id", productId)
    .eq("organization_id", ctx.organizationId)
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
