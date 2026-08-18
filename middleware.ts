import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isAuthPublicPath } from "@/lib/auth/paths";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import { logger } from "@/lib/logger";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  if (pathname.startsWith("/api")) {
    return response;
  }

  const env = getPublicSupabaseEnv();
  if (!env.ok) {
    return response;
  }

  const supabase = createServerClient<Database>(
    env.data.supabaseUrl,
    env.data.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  let user: { id: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      user = data.user;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.service("middleware: auth refresh failed", {
      path: pathname,
      message: msg,
    });
  }

  const isPublic = isAuthPublicPath(pathname);

  if (!user) {
    if (!isPublic) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return response;
  }

  let hasOrganization = false;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    hasOrganization = Boolean(profile?.organization_id);
  } catch (err) {
    logger.service("middleware: profile lookup failed", {
      path: pathname,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (!hasOrganization && pathname !== "/setup") {
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  // Invited staff must be able to set their own password without
  // being bounced into an already-open owner session/dashboard.
  if (hasOrganization && isPublic && pathname !== "/set-password") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
