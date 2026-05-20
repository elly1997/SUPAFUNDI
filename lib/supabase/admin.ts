import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseAdminSupabaseEnv } from "@/lib/env/server";

/**
 * Service-role client for trusted server-only code (never import in Client Components).
 */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const env = parseAdminSupabaseEnv();
  if (!env.ok) {
    throw new Error(`Invalid admin Supabase configuration: ${env.issues.join("; ")}`);
  }

  return createClient<Database>(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
