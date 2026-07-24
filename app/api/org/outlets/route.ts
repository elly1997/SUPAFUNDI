import { NextResponse } from "next/server";
import {
  loadOrgOutlets,
  outletsForOperations,
  type OrgOutletOption,
} from "@/lib/data/org-outlets";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Outlets a non-manager was explicitly granted access to (via OTP redemption). */
async function loadGrantedOutletIds(userId: string): Promise<Set<string>> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase
      .from("user_outlet_access")
      .select("outlet_id")
      .eq("user_id", userId);
    return new Set((data ?? []).map((r) => String(r.outlet_id)));
  } catch {
    // Table may not exist before the migration is applied — degrade gracefully.
    return new Set<string>();
  }
}

function visibleForStaff(
  all: OrgOutletOption[],
  grantedIds: Set<string>
): OrgOutletOption[] {
  const visible = all.filter((o) => o.is_active || grantedIds.has(o.id));
  return visible.length > 0 ? visible : outletsForOperations(all);
}

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const all = await loadOrgOutlets(ctx.organizationId);

    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", ctx.userId)
      .maybeSingle();
    const role = profile?.role ?? null;

    // Owners and managers see every outlet (active + inactive) so they can
    // manage assignments and switch into any branch.
    if (role === "owner" || role === "manager") {
      return NextResponse.json({ outlets: all });
    }

    const grantedIds = await loadGrantedOutletIds(ctx.userId);
    return NextResponse.json({ outlets: visibleForStaff(all, grantedIds) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load outlets";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
