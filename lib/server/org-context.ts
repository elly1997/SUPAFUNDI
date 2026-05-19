import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OrgContext = {
  userId: string;
  organizationId: string;
  outletId: string | null;
};

export async function requireOrgContext(): Promise<OrgContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error("You must be signed in.");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id, outlet_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    throw new Error(profileError.message);
  }
  if (!profile?.organization_id) {
    throw new Error(
      "Your profile is not linked to an organization yet. Complete setup first."
    );
  }
  return {
    userId: user.id,
    organizationId: profile.organization_id,
    outletId: profile.outlet_id,
  };
}
