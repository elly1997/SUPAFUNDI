import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OutletRow = {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
};

/**
 * Request-scoped memoization for outlet list (safe with cookies / RLS).
 * Do not use unstable_cache here — Supabase server client reads cookies.
 */
export const getCachedOutlets = cache(
  async (organizationId: string): Promise<OutletRow[]> => {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("outlets")
      .select("id, name, code, is_default")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  }
);
