import type { createServerSupabaseClient } from "@/lib/supabase/server";

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

/** Resolve category id, create by name, or return null for General (uncategorized). */
export async function resolveProductCategoryId(
  supabase: Supabase,
  organizationId: string,
  categoryId: string | null | undefined,
  categoryName?: string | null
): Promise<string | null> {
  if (categoryId) {
    return ensureCategory(supabase, organizationId, categoryId, undefined);
  }
  if (categoryName?.trim()) {
    return ensureCategory(supabase, organizationId, null, categoryName);
  }
  return null;
}

/** Create or find a category by id/name — always returns a concrete id. */
export async function ensureProductCategory(
  supabase: Supabase,
  organizationId: string,
  categoryId: string | null,
  categoryName: string | undefined
): Promise<string> {
  return ensureCategory(supabase, organizationId, categoryId, categoryName);
}
