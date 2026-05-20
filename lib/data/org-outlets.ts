import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const MIGRATION_HINT =
  "Run Supabase migrations (outlet is_default) in SQL Editor.";

export type OrgOutletOption = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
  is_active: boolean;
};

/** Outlets for dropdowns (inventory, POS helpers). Matches settings visibility. */
export async function loadOrgOutlets(
  organizationId: string
): Promise<OrgOutletOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id, name, code, is_active, is_default")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name");

  if (error?.message?.includes("is_default")) {
    const { data: fallback, error: err2 } = await supabase
      .from("outlets")
      .select("id, name, code, is_active")
      .eq("organization_id", organizationId)
      .order("name");
    if (err2) {
      throw new Error(`${err2.message}. ${MIGRATION_HINT}`);
    }
    return (fallback ?? []).map((o) => ({
      id: String(o.id),
      name: String(o.name),
      code: o.code != null ? String(o.code) : null,
      is_default: false,
      is_active: Boolean(o.is_active),
    }));
  }
  if (error) throw new Error(error.message);

  return (data ?? []).map((o) => ({
    id: String(o.id),
    name: String(o.name),
    code: o.code != null ? String(o.code) : null,
    is_default: Boolean(o.is_default),
    is_active: Boolean(o.is_active),
  }));
}

/** Active outlets for stock/POS; if none marked active, return all (e.g. legacy rows). */
export function outletsForOperations(
  outlets: OrgOutletOption[]
): OrgOutletOption[] {
  const active = outlets.filter((o) => o.is_active);
  return active.length > 0 ? active : outlets;
}
