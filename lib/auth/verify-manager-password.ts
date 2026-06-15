import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import { requireManagerContext } from "@/lib/server/require-manager";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Re-verify the signed-in manager/owner's login password without replacing
 * the browser session (ephemeral client, no cookie persistence).
 */
export async function verifyManagerPassword(
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!password || password.length < 6) {
    return { ok: false, message: "Enter your account password." };
  }

  await requireManagerContext();

  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return { ok: false, message: "Server configuration error." };
  }

  const sessionClient = await createServerSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await sessionClient.auth.getUser();
  if (userErr || !user?.email) {
    return { ok: false, message: "Session expired — sign in again." };
  }

  const probe = createClient<Database>(
    env.data.supabaseUrl,
    env.data.supabaseAnonKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  const { error } = await probe.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) {
    return { ok: false, message: "Incorrect password." };
  }

  return { ok: true };
}
