"use client";

import { getBrowserSupabase } from "@/lib/supabase/client";
import { signOut as signOutServer } from "@/lib/actions/auth";
import { useAuthStore } from "@/stores/authStore";

/** Clear client session, revoke Supabase auth, and sync server cookies. */
export async function performSignOut(): Promise<void> {
  useAuthStore.getState().clear();

  const supabase = getBrowserSupabase();
  if (supabase) {
    await supabase.auth.signOut();
  }

  await signOutServer();
}
