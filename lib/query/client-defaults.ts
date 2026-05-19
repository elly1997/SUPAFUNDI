/**
 * Retry policy tuned for PostgREST / Supabase + browser fetch failures.
 * Avoids hammering the API on auth/permission/validation errors.
 */
export function queryShouldRetry(
  failureCount: number,
  error: unknown
): boolean {
  if (failureCount >= 3) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  const blob = `${message} ${code}`.toLowerCase();
  if (
    /pgrst301|pgrst302|jwt|invalid|permission|forbidden|not\s+found|404|422|42501|abort|cancel|42\d{3}/.test(
      blob
    )
  ) {
    return false;
  }
  return true;
}
