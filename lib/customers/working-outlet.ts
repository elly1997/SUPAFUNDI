import "server-only";

import type { OrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Working outlet for customer scoping (matches header branch switcher,
 * which updates profiles.outlet_id).
 */
export async function resolveWorkingOutletId(
  ctx: OrgContext
): Promise<string | null> {
  if (ctx.outletId) return ctx.outletId;

  const supabase = await createServerSupabaseClient();
  const withDefault = await supabase
    .from("outlets")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("name")
    .limit(1)
    .maybeSingle();

  if (!withDefault.error && withDefault.data?.id) {
    return withDefault.data.id;
  }

  const fallback = await supabase
    .from("outlets")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();

  return fallback.data?.id ?? null;
}
