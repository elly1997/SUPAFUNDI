import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OutletRow = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
  is_active: boolean;
};

type RawOutlet = {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
};

function toOutletRow(o: RawOutlet, defaultActive = true): OutletRow {
  return {
    id: String(o.id),
    name: String(o.name),
    code: o.code != null ? String(o.code) : null,
    is_default: Boolean(o.is_default),
    is_active: o.is_active == null ? defaultActive : Boolean(o.is_active),
  };
}

async function loadGrantedOutletIds(userId: string): Promise<Set<string>> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("user_outlet_access")
      .select("outlet_id")
      .eq("user_id", userId);
    return new Set((data ?? []).map((r) => String(r.outlet_id)));
  } catch {
    return new Set<string>();
  }
}

/**
 * Request-scoped memoization for outlet list (safe with cookies / RLS).
 * Do not use unstable_cache here — Supabase server client reads cookies.
 *
 * Owners/managers see all outlets (active + inactive); other staff see active
 * outlets plus any they were granted via an outlet-access code.
 */
export const getCachedOutlets = cache(
  async (organizationId: string): Promise<OutletRow[]> => {
    const supabase = await createServerSupabaseClient();

    let all: OutletRow[];
    const { data, error } = await supabase
      .from("outlets")
      .select("id, name, code, is_default, is_active")
      .eq("organization_id", organizationId)
      .order("is_default", { ascending: false })
      .order("name");

    if (error?.message?.includes("is_default")) {
      const { data: fallback, error: err2 } = await supabase
        .from("outlets")
        .select("id, name, code, is_active")
        .eq("organization_id", organizationId)
        .order("name");
      if (err2) throw new Error(err2.message);
      all = (fallback ?? []).map((o) => toOutletRow({ ...o, is_default: false }));
    } else if (error) {
      throw new Error(error.message);
    } else {
      all = (data ?? []).map((o) => toOutletRow(o));
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    let role: string | null = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = profile?.role ?? null;
    }

    if (role === "owner" || role === "manager") {
      return all;
    }

    const grantedIds = user
      ? await loadGrantedOutletIds(user.id)
      : new Set<string>();
    const visible = all.filter((o) => o.is_active || grantedIds.has(o.id));
    // If none are active/granted (e.g. legacy data), fall back to all so the
    // POS is never left with an empty outlet list.
    return visible.length > 0 ? visible : all;
  }
);
