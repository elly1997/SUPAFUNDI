import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env/public";

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Single browser Supabase client (avoids multiple GoTrue listeners / memory churn).
 * Returns undefined when env is missing or invalid — callers must handle gracefully.
 */
export function getBrowserSupabase(): SupabaseClient<Database> | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  if (browserClient) {
    return browserClient;
  }
  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return undefined;
  }
  browserClient = createBrowserClient<Database>(
    env.data.supabaseUrl,
    env.data.supabaseAnonKey
  );
  return browserClient;
}
