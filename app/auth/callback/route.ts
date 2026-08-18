import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env/public";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function redirectToApp(request: Request, path: string) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    process.env.NODE_ENV === "development"
      ? url.origin
      : forwardedHost
        ? `https://${forwardedHost}`
        : url.origin;
  return NextResponse.redirect(new URL(path, origin));
}

/**
 * Completes invite / magic-link / PKCE redirects from Supabase email.
 * Query: ?code=…  or  ?token_hash=…&type=invite
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return redirectToApp(request, "/login?error=invite");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    env.data.supabaseUrl,
    env.data.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  let errorMessage: string | null = null;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    errorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    errorMessage = error?.message ?? null;
  } else {
    errorMessage = "Missing invite token";
  }

  if (errorMessage) {
    return redirectToApp(
      request,
      `/login?error=invite&reason=${encodeURIComponent(errorMessage)}`
    );
  }

  return redirectToApp(request, next);
}
