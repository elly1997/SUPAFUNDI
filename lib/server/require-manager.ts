import "server-only";

import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireManagerContext(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (
    !profile?.role ||
    !canManageSettings(isUserRole(profile.role) ? profile.role : null)
  ) {
    throw new Error("Only owners and managers can change settings.");
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}
