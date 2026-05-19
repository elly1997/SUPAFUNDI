"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { getPublicSupabaseEnv } from "@/lib/env/public";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const configured = getPublicSupabaseEnv().ok;

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setLoading(false);
      setUser(null);
      setAuthError(configured ? null : "Supabase environment is not configured");
      return;
    }

    let cancelled = false;

    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAuthError(error.message);
          setUser(null);
        } else {
          setAuthError(null);
          setUser(data.user ?? null);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : "Auth check failed");
        setUser(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) {
        setUser(session?.user ?? null);
        setAuthError(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, authError, configured };
}
