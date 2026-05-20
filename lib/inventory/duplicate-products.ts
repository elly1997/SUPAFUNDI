import "server-only";

import { normalizeProductName } from "@/lib/products/product-name";
import type {
  DuplicateProductEntry,
  DuplicateProductGroup,
} from "@/lib/types/duplicate-products";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type { DuplicateProductEntry, DuplicateProductGroup };

function pickKeeperIndex(entries: DuplicateProductEntry[]): number {
  let best = 0;
  for (let i = 1; i < entries.length; i++) {
    const a = entries[best];
    const b = entries[i];
    if (b.totalStockQty > a.totalStockQty) {
      best = i;
      continue;
    }
    if (b.totalStockQty === a.totalStockQty && b.createdAt < a.createdAt) {
      best = i;
    }
  }
  return best;
}

export async function findDuplicateProductGroups(
  organizationId: string
): Promise<DuplicateProductGroup[]> {
  const supabase = await createServerSupabaseClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, code, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!products?.length) return [];

  const ids = products.map((p) => p.id);
  const stockByProduct = new Map<string, number>();
  const { data: stockRows } = await supabase
    .from("stock")
    .select("product_id, quantity")
    .in("product_id", ids);
  for (const s of stockRows ?? []) {
    stockByProduct.set(
      s.product_id,
      (stockByProduct.get(s.product_id) ?? 0) + Number(s.quantity)
    );
  }

  const byName = new Map<string, DuplicateProductEntry[]>();
  for (const p of products) {
    const key = normalizeProductName(p.name);
    const entry: DuplicateProductEntry = {
      id: p.id,
      code: p.code,
      name: p.name,
      createdAt: p.created_at,
      totalStockQty: stockByProduct.get(p.id) ?? 0,
      keepRecommended: false,
    };
    const list = byName.get(key) ?? [];
    list.push(entry);
    byName.set(key, list);
  }

  const groups: DuplicateProductGroup[] = [];
  for (const [nameKey, entries] of Array.from(byName.entries())) {
    if (entries.length < 2) continue;
    const keeperIdx = pickKeeperIndex(entries);
    const marked = entries.map((e, i) => ({
      ...e,
      keepRecommended: i === keeperIdx,
    }));
    groups.push({
      nameKey,
      displayName: marked[keeperIdx]?.name ?? nameKey,
      entries: marked,
      toRemoveCount: marked.length - 1,
    });
  }

  groups.sort((a, b) => b.toRemoveCount - a.toRemoveCount);
  return groups;
}

const DELETE_BATCH = 150;

export async function deleteProductsByIds(
  organizationId: string,
  productIds: string[]
): Promise<{
  deleted: number;
  errors: { id: string; code: string | null; name: string; message: string }[];
}> {
  const uniqueIds = Array.from(new Set(productIds));
  if (uniqueIds.length === 0) return { deleted: 0, errors: [] };

  const supabase = await createServerSupabaseClient();
  const errors: {
    id: string;
    code: string | null;
    name: string;
    message: string;
  }[] = [];
  let deleted = 0;

  for (let i = 0; i < uniqueIds.length; i += DELETE_BATCH) {
    const chunk = uniqueIds.slice(i, i + DELETE_BATCH);

    const { error: returnErr } = await supabase
      .from("supplier_return_items")
      .delete()
      .in("product_id", chunk);
    if (returnErr) {
      for (const id of chunk) {
        errors.push({
          id,
          code: null,
          name: "—",
          message: `Supplier return link: ${returnErr.message}`,
        });
      }
      continue;
    }

    const { data: removed, error: delErr } = await supabase
      .from("products")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", chunk)
      .select("id, code, name");

    if (delErr) {
      for (const id of chunk) {
        errors.push({
          id,
          code: null,
          name: "—",
          message: delErr.message,
        });
      }
      continue;
    }

    const removedIds = new Set((removed ?? []).map((r) => r.id));
    deleted += removedIds.size;
    for (const id of chunk) {
      if (!removedIds.has(id)) {
        errors.push({
          id,
          code: null,
          name: "—",
          message: "Product not found or could not be deleted.",
        });
      }
    }
  }

  return { deleted, errors };
}

/** Delete all duplicate rows, keeping one per name (stock first, then oldest). */
export async function removeAllDuplicateProducts(
  organizationId: string
): Promise<{
  deleted: number;
  groupsProcessed: number;
  errors: { id: string; code: string | null; name: string; message: string }[];
}> {
  const groups = await findDuplicateProductGroups(organizationId);
  const toDelete = groups.flatMap((g) =>
    g.entries.filter((e) => !e.keepRecommended).map((e) => e.id)
  );
  const result = await deleteProductsByIds(organizationId, toDelete);
  return {
    deleted: result.deleted,
    groupsProcessed: groups.length,
    errors: result.errors,
  };
}
