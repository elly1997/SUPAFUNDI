import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env/public";

function safeNextPath(value: string | null, type: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  if (type === "invite" || type === "recovery" || type === "email") {
    return "/set-password";
  }
  return "/set-password";
}

function redirectUrl(request: Request, path: string) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin =
    process.env.NODE_ENV === "development"
      ? url.origin
      : forwardedHost
        ? `https://${forwardedHost}`
        : url.origin;
  return new URL(path, origin);
}

/**
 * Completes invite / magic-link / PKCE redirects from Supabase email.
 * Always lands invited staff on /set-password for their own account.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(requestUrl.searchParams.get("next"), type);

  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return NextResponse.redirect(redirectUrl(request, "/login?error=invite"));
  }

  const cookieStore = await cookies();
  const pendingCookies: {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  }[] = [];

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
            pendingCookies.push({ name, value, options });
          });
        },
      },
    }
  );

  // Drop any existing (owner) session so the invitee is not opened as the owner.
  await supabase.auth.signOut({ scope: "local" });

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

  const path = errorMessage
    ? `/login?error=invite&reason=${encodeURIComponent(errorMessage)}`
    : next;
  const response = NextResponse.redirect(redirectUrl(request, path));
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  return response;
}
