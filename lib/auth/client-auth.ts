import { getBrowserSupabase } from "@/lib/supabase/client";
import { getPublicSupabaseEnv } from "@/lib/env/public";

export type ClientAuthResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; message: string };

function configError(): ClientAuthResult {
  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return {
      ok: false,
      message: `Supabase not configured: ${env.issues.join(", ")}`,
    };
  }
  return {
    ok: false,
    message: "Could not connect to Supabase. Refresh the page and try again.",
  };
}

async function ensureOwnerProfile(
  userId: string,
  fullName: string,
  email: string
): Promise<ClientAuthResult | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return configError();
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) {
    return null;
  }

  const { error } = await supabase.from("profiles").insert({
    id: userId,
    full_name: fullName.trim(),
    email: email.trim().toLowerCase(),
    role: "owner",
    is_active: true,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return null;
}

export async function signInWithPasswordClient(
  email: string,
  password: string
): Promise<ClientAuthResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return configError();
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data.user) {
    return { ok: false, message: "Sign in failed." };
  }

  const metaName =
    typeof data.user.user_metadata?.full_name === "string"
      ? data.user.user_metadata.full_name
      : email.split("@")[0];

  const profileErr = await ensureOwnerProfile(
    data.user.id,
    metaName,
    data.user.email ?? email
  );
  if (profileErr) {
    return profileErr;
  }

  return { ok: true };
}

export async function signUpWithPasswordClient(
  fullName: string,
  email: string,
  password: string
): Promise<ClientAuthResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) {
    return configError();
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!data.user) {
    return { ok: false, message: "Account could not be created." };
  }

  if (data.session) {
    const profileErr = await ensureOwnerProfile(
      data.user.id,
      fullName,
      normalizedEmail
    );
    if (profileErr) {
      return profileErr;
    }
    return { ok: true };
  }

  return {
    ok: true,
    needsEmailConfirmation: true,
  };
}
