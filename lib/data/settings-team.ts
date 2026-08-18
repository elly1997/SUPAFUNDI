import "server-only";

import type { OutletRow, UserInviteStatus, UserRow } from "@/lib/types/settings-team";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MIGRATION_HINT =
  "Run Supabase migrations (outlet is_default + expense categories) in SQL Editor.";

function toPlainOutlet(row: {
  id: string;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  is_default?: boolean;
}): OutletRow {
  return {
    id: String(row.id),
    name: String(row.name),
    code: row.code != null ? String(row.code) : null,
    address: row.address != null ? String(row.address) : null,
    phone: row.phone != null ? String(row.phone) : null,
    is_active: Boolean(row.is_active),
    is_default: Boolean(row.is_default),
  };
}

async function fetchAuthInviteMeta(userId: string): Promise<{
  invited_at?: string;
  email_confirmed_at?: string;
  last_sign_in_at?: string;
} | null> {
  try {
    const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    const u = data.user;
    return {
      invited_at: u.invited_at ? String(u.invited_at) : undefined,
      email_confirmed_at: u.email_confirmed_at
        ? String(u.email_confirmed_at)
        : undefined,
      last_sign_in_at: u.last_sign_in_at ? String(u.last_sign_in_at) : undefined,
    };
  } catch {
    return null;
  }
}

function deriveInviteStatus(
  isActive: boolean,
  authUser: {
    invited_at?: string;
    email_confirmed_at?: string;
    last_sign_in_at?: string;
  } | null
): UserInviteStatus {
  if (!isActive) return "inactive";
  if (
    authUser?.invited_at &&
    !authUser.email_confirmed_at &&
    !authUser.last_sign_in_at
  ) {
    return "pending_invite";
  }
  if (authUser?.invited_at && !authUser.email_confirmed_at) {
    return "pending_invite";
  }
  return "active";
}

export async function loadOutletsForSettings(
  organizationId: string
): Promise<OutletRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("outlets")
    .select("id, name, code, address, phone, is_active, is_default")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name");

  if (error?.message?.includes("is_default")) {
    const { data: fallback, error: err2 } = await supabase
      .from("outlets")
      .select("id, name, code, address, phone, is_active")
      .eq("organization_id", organizationId)
      .order("name");
    if (err2) {
      throw new Error(`${err2.message}. ${MIGRATION_HINT}`);
    }
    return (fallback ?? []).map((o) =>
      toPlainOutlet({ ...o, is_default: false })
    );
  }
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPlainOutlet);
}

export async function loadUsersForSettings(
  organizationId: string
): Promise<UserRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, outlet_id, is_active")
    .eq("organization_id", organizationId)
    .order("full_name");
  if (error) throw new Error(error.message);

  const allOutlets = await loadOutletsForSettings(organizationId);
  const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));

  const authMeta = await Promise.all(
    (profiles ?? []).map(async (p) => ({
      id: p.id,
      meta: await fetchAuthInviteMeta(p.id),
    }))
  );
  const authById = new Map(authMeta.map((a) => [a.id, a.meta]));

  const profileIds = (profiles ?? []).map((p) => p.id);
  const grantedByUser = new Map<string, string[]>();
  if (profileIds.length) {
    const { data: grants } = await supabase
      .from("user_outlet_access")
      .select("user_id, outlet_id")
      .eq("organization_id", organizationId)
      .in("user_id", profileIds);
    for (const g of grants ?? []) {
      const uid = String(g.user_id);
      const name = outletMap.get(String(g.outlet_id));
      if (!name) continue;
      const list = grantedByUser.get(uid) ?? [];
      if (!list.includes(name)) list.push(name);
      grantedByUser.set(uid, list);
    }
  }

  return (profiles ?? []).map((p) => {
    const authUser = authById.get(p.id) ?? null;
    const invite_status = deriveInviteStatus(p.is_active, authUser);
    const homeOutletId = p.outlet_id != null ? String(p.outlet_id) : null;
    const granted = (grantedByUser.get(p.id) ?? []).filter(
      (name) => name !== (homeOutletId ? outletMap.get(homeOutletId) : null)
    );
    return {
      id: String(p.id),
      email: p.email != null ? String(p.email) : null,
      full_name: p.full_name != null ? String(p.full_name) : null,
      role: String(p.role),
      outlet_id: homeOutletId,
      outlet_name: homeOutletId ? (outletMap.get(homeOutletId) ?? null) : null,
      granted_outlet_names: granted,
      is_active: Boolean(p.is_active),
      invite_status,
      invited_at: authUser?.invited_at ?? null,
    };
  });
}
