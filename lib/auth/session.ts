import "server-only";

import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isUserRole, type UserRole } from "@/lib/auth/roles";
import { getPublicSupabaseEnv } from "@/lib/env/public";

export type SessionProfile = {
  userId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  outletId: string | null;
};

/** Request-scoped — layout + pages must not each hit Supabase auth separately. */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  if (!getPublicSupabaseEnv().ok) {
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, organization_id, outlet_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.organization_id) {
    return null;
  }

  const roleRaw = profile.role;
  if (!isUserRole(roleRaw)) {
    return null;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", profile.organization_id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    role: roleRaw,
    organizationId: profile.organization_id,
    organizationName: org?.name ?? "Organization",
    outletId: profile.outlet_id,
  };
});
