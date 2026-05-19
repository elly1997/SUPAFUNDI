import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env/public";

/**
 * Server Supabase client with cookie session. Throws if public env is invalid
 * (misconfiguration should fail fast on the server).
 */
export async function createServerSupabaseClient(): Promise<
  SupabaseClient<Database>
> {
  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    throw new Error(
      `Invalid Supabase configuration: ${env.issues.join("; ")}`
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.data.supabaseUrl,
    env.data.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component without mutable cookies — refresh handled elsewhere.
          }
        },
      },
    }
  );
}
