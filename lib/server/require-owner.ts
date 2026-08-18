import "server-only";

import { isUserRole, type UserRole } from "@/lib/auth/roles";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireOwnerContext(): Promise<{
  userId: string;
  organizationId: string;
  role: UserRole;
}> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const role = profile?.role && isUserRole(profile.role) ? profile.role : null;
  if (role !== "owner") {
    throw new Error("Only owners can perform this action.");
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId, role };
}
