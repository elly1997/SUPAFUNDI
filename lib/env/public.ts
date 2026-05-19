import { z } from "zod";

const publicSupabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "Missing URL")
    .pipe(z.string().url("Must be a valid URL")),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(80, "Anon key looks invalid"),
});

export type ParsedPublicSupabaseEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type ParsePublicSupabaseResult =
  | { ok: true; data: ParsedPublicSupabaseEnv }
  | { ok: false; issues: string[] };

let memoized: ParsePublicSupabaseResult | null = null;

/**
 * Validates public Supabase env at runtime (no throw). Safe for Edge / client bundles.
 * Result is memoized per process for cheap repeated checks on hot paths.
 */
export function getPublicSupabaseEnv(): ParsePublicSupabaseResult {
  if (memoized) {
    return memoized;
  }
  const result = publicSupabaseSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    memoized = { ok: false, issues };
    return memoized;
  }
  memoized = {
    ok: true,
    data: {
      supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  };
  return memoized;
}

/** @deprecated Use getPublicSupabaseEnv — same behavior, clearer name for callers */
export function parsePublicSupabaseEnv(): ParsePublicSupabaseResult {
  return getPublicSupabaseEnv();
}
