import { z } from "zod";
import { getPublicSupabaseEnv } from "./public";

const serviceRoleSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(80, "Service role key looks invalid"),
});

export type ParseAdminEnvResult =
  | { ok: true; supabaseUrl: string; serviceRoleKey: string }
  | { ok: false; issues: string[] };

/**
 * Validates env for the service-role client (server-only).
 */
export function parseAdminSupabaseEnv(): ParseAdminEnvResult {
  const pub = getPublicSupabaseEnv();
  if (!pub.ok) {
    return { ok: false, issues: pub.issues };
  }
  const sr = serviceRoleSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!sr.success) {
    return {
      ok: false,
      issues: sr.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return {
    ok: true,
    supabaseUrl: pub.data.supabaseUrl,
    serviceRoleKey: sr.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}
