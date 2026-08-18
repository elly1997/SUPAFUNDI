import "server-only";

import type { OrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Working outlet for branch-scoped lists. Prefers an explicit request
 * (POS/header switcher), then the profile assignment, then org default.
 */
export async function resolveWorkingOutletId(
  ctx: OrgContext,
  requested?: string | null
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const candidate = requested?.trim() || ctx.outletId;
  if (candidate) {
    const { data } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", candidate)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

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
