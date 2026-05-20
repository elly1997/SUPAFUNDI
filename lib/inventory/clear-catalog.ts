import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const BATCH = 200;

export async function clearAllProducts(
  organizationId: string
): Promise<{ deleted: number } | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: products, error: listErr } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", organizationId);
  if (listErr) return { error: listErr.message };

  const ids = (products ?? []).map((p) => p.id);
  if (ids.length === 0) return { deleted: 0 };

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const { error: retErr } = await supabase
      .from("supplier_return_items")
      .delete()
      .in("product_id", chunk);
    if (retErr) {
      return {
        error: `Could not clear supplier return links: ${retErr.message}`,
      };
    }
  }

  const { error: delErr } = await supabase
    .from("products")
    .delete()
    .eq("organization_id", organizationId);
  if (delErr) return { error: delErr.message };

  return { deleted: ids.length };
}
