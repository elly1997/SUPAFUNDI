/** Routes that do not require authentication. */
export const AUTH_PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/auth/callback",
  "/auth/confirm",
] as const;

export function isAuthPublicPath(pathname: string): boolean {
  return AUTH_PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export function isDashboardPath(pathname: string): boolean {
  if (pathname.startsWith("/api")) return false;
  if (isAuthPublicPath(pathname)) return false;
  if (pathname.startsWith("/_next")) return false;
  return true;
}
