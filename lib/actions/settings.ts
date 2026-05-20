"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  parseExpenseCategoriesJson,
  serializeExpenseCategories,
  slugifyExpenseCategory,
  type ExpenseCategory,
} from "@/lib/constants/expense-categories";
import { USER_ROLES, canManageSettings, isUserRole } from "@/lib/auth/roles";
import { requireOrgContext } from "@/lib/server/org-context";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireManager(): Promise<{
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
  if (!profile?.role || !canManageSettings(isUserRole(profile.role) ? profile.role : null)) {
    throw new Error("Only owners and managers can change settings.");
  }
  return { userId: ctx.userId, organizationId: ctx.organizationId };
}

const MIGRATION_HINT =
  "Run Supabase migrations (outlet is_default + expense categories) in SQL Editor.";

/** Manager settings: service role so lists are reliable and not blocked by RLS edge cases. */
async function adminListOutletsForOrg(organizationId: string): Promise<OutletRow[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("outlets")
    .select("id, name, code, address, phone, is_active, is_default")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name");

  if (error?.message?.includes("is_default")) {
    const { data: fallback, error: err2 } = await admin
      .from("outlets")
      .select("id, name, code, address, phone, is_active")
      .eq("organization_id", organizationId)
      .order("name");
    if (err2) {
      throw new Error(`${err2.message}. ${MIGRATION_HINT}`);
    }
    return (fallback ?? []).map((o) => ({
      ...o,
      is_default: false,
    }));
  }
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type UserInviteStatus = "active" | "pending_invite" | "inactive";

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

export type OrganizationSettings = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  currency: string;
  country: string;
  defaultVatRate: number;
  receiptFooter: string;
  requireCashSession: boolean;
};

export async function getOrganizationSettings(): Promise<OrganizationSettings | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id, name, address, phone, email, tax_id, currency, country")
    .eq("id", ctx.organizationId)
    .maybeSingle();
  if (error || !org) return null;

  const { data: settings } = await supabase
    .from("settings")
    .select("key, value")
    .eq("organization_id", ctx.organizationId);

  const map = new Map((settings ?? []).map((s) => [s.key, s.value]));
  return {
    id: org.id,
    name: org.name,
    address: org.address,
    phone: org.phone,
    email: org.email,
    tax_id: org.tax_id,
    currency: org.currency,
    country: org.country,
    defaultVatRate: Number(map.get("default_vat_rate") ?? 18),
    receiptFooter: map.get("receipt_footer") ?? "Thank you for your business.",
    requireCashSession: map.get("require_cash_session") === "true",
  };
}

const updateOrgSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal("")),
  taxId: z.string().max(80).optional(),
  currency: z.string().length(3).default("TZS"),
  country: z.string().length(2).default("TZ"),
  defaultVatRate: z.coerce.number().min(0).max(100).default(18),
  receiptFooter: z.string().max(500).optional(),
  requireCashSession: z.boolean().default(false),
});

export async function updateOrganizationSettings(
  raw: z.infer<typeof updateOrgSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = updateOrgSchema.parse(raw);
    const { organizationId } = await requireManager();
    const supabase = await createServerSupabaseClient();

    const { error: orgErr } = await supabase
      .from("organizations")
      .update({
        name: input.name.trim(),
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        tax_id: input.taxId?.trim() || null,
        currency: input.currency,
        country: input.country,
      })
      .eq("id", organizationId);
    if (orgErr) return { ok: false, message: orgErr.message };

    const upserts = [
      { key: "default_vat_rate", value: String(input.defaultVatRate) },
      {
        key: "receipt_footer",
        value: input.receiptFooter?.trim() || "Thank you for your business.",
      },
      {
        key: "require_cash_session",
        value: input.requireCashSession ? "true" : "false",
      },
    ];
    for (const row of upserts) {
      const { error } = await supabase.from("settings").upsert(
        {
          organization_id: organizationId,
          key: row.key,
          value: row.value,
        },
        { onConflict: "organization_id,key" }
      );
      if (error) return { ok: false, message: error.message };
    }

    revalidatePath("/settings/general");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

export type OutletRow = {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  is_default: boolean;
};

export async function listOutletsSettings(): Promise<OutletRow[]> {
  const { organizationId } = await requireManager();
  return adminListOutletsForOrg(organizationId);
}

const outletSchema = z.object({
  name: z.string().min(2).max(200),
  code: z
    .string()
    .max(8)
    .regex(/^[A-Za-z0-9]*$/, "Code: letters and numbers only")
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
});

export async function createOutlet(
  raw: z.infer<typeof outletSchema>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = outletSchema.parse(raw);
    const { organizationId } = await requireManager();
    const admin = createAdminSupabaseClient();
    const code = input.code?.trim().toUpperCase() || null;
    const existing = await adminListOutletsForOrg(organizationId);
    const isFirst = existing.length === 0;

    const baseInsert = {
      organization_id: organizationId,
      name: input.name.trim(),
      code,
      address: input.address?.trim() || null,
      phone: input.phone?.trim() || null,
      is_active: true,
    };

    let { data, error } = await admin
      .from("outlets")
      .insert({ ...baseInsert, is_default: isFirst })
      .select("id")
      .single();

    if (error?.message?.includes("is_default")) {
      const retry = await admin
        .from("outlets")
        .insert(baseInsert)
        .select("id")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data) {
      return {
        ok: false,
        message: error?.message
          ? `${error.message}${error.message.includes("is_default") ? ` ${MIGRATION_HINT}` : ""}`
          : "Create failed",
      };
    }
    revalidatePath("/settings/outlets");
    revalidatePath("/settings/general");
    revalidatePath("/", "layout");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create outlet failed",
    };
  }
}

export async function updateOutlet(
  id: string,
  raw: z.infer<typeof outletSchema> & { isActive: boolean }
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = outletSchema.extend({ isActive: z.boolean() }).parse(raw);
    const { organizationId } = await requireManager();
    const admin = createAdminSupabaseClient();
    const code = input.code?.trim().toUpperCase() || null;
    const { error } = await admin
      .from("outlets")
      .update({
        name: input.name.trim(),
        code,
        address: input.address?.trim() || null,
        phone: input.phone?.trim() || null,
        is_active: input.isActive,
      })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/outlets");
    revalidatePath("/settings/general");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update outlet failed",
    };
  }
}

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  outlet_id: string | null;
  outlet_name: string | null;
  is_active: boolean;
  invite_status: UserInviteStatus;
  invited_at: string | null;
};

export async function listOrganizationUsers(): Promise<UserRow[]> {
  const { organizationId } = await requireManager();
  const admin = createAdminSupabaseClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, outlet_id, is_active")
    .eq("organization_id", organizationId)
    .order("full_name");
  if (error) throw new Error(error.message);

  const allOutlets = await adminListOutletsForOrg(organizationId);
  const outletMap = new Map(allOutlets.map((o) => [o.id, o.name]));

  const authById = new Map<
    string,
    {
      invited_at?: string;
      email_confirmed_at?: string;
      last_sign_in_at?: string;
    }
  >();

  await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: authData, error: authErr } =
        await admin.auth.admin.getUserById(p.id);
      if (!authErr && authData?.user) {
        authById.set(p.id, {
          invited_at: authData.user.invited_at ?? undefined,
          email_confirmed_at: authData.user.email_confirmed_at ?? undefined,
          last_sign_in_at: authData.user.last_sign_in_at ?? undefined,
        });
      }
    })
  );

  return (profiles ?? []).map((p) => {
    const authUser = authById.get(p.id) ?? null;
    const invite_status = deriveInviteStatus(p.is_active, authUser);
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      outlet_id: p.outlet_id,
      outlet_name: p.outlet_id ? (outletMap.get(p.outlet_id) ?? null) : null,
      is_active: p.is_active,
      invite_status,
      invited_at: authUser?.invited_at ?? null,
    };
  });
}

const inviteUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(200),
  role: z.enum(USER_ROLES),
  outletId: z.string().uuid().nullable().optional(),
});

export async function inviteOrganizationUser(
  raw: z.infer<typeof inviteUserSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = inviteUserSchema.parse(raw);
    const { organizationId } = await requireManager();
    const admin = createAdminSupabaseClient();

    if (input.outletId) {
      const { data: outlet } = await admin
        .from("outlets")
        .select("id")
        .eq("id", input.outletId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!outlet) return { ok: false, message: "Invalid outlet." };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { data: invited, error: inviteErr } =
      await admin.auth.admin.inviteUserByEmail(input.email, {
        data: { full_name: input.fullName },
        redirectTo: `${appUrl}/login`,
      });
    if (inviteErr || !invited.user) {
      return { ok: false, message: inviteErr?.message ?? "Invite failed" };
    }

    const { error: profileErr } = await admin.from("profiles").upsert(
      {
        id: invited.user.id,
        organization_id: organizationId,
        outlet_id: input.outletId ?? null,
        full_name: input.fullName.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        is_active: true,
      },
      { onConflict: "id" }
    );
    if (profileErr) {
      return { ok: false, message: profileErr.message };
    }

    await admin.auth.admin.updateUserById(invited.user.id, {
      app_metadata: { organization_id: organizationId },
    });

    revalidatePath("/settings/users");
    revalidatePath("/settings/general");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Invite failed",
    };
  }
}

const updateUserSchema = z.object({
  fullName: z.string().min(2).max(200),
  role: z.enum(USER_ROLES),
  outletId: z.string().uuid().nullable().optional(),
  isActive: z.boolean(),
});

export async function updateOrganizationUser(
  userId: string,
  raw: z.infer<typeof updateUserSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = updateUserSchema.parse(raw);
    const { organizationId, userId: actorId } = await requireManager();

    if (userId === actorId && !input.isActive) {
      return { ok: false, message: "You cannot deactivate your own account." };
    }
    if (userId === actorId && input.role !== "owner") {
      return { ok: false, message: "You cannot change your own owner role." };
    }

    const admin = createAdminSupabaseClient();
    const { data: target } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!target) return { ok: false, message: "User not found." };

    if (input.outletId) {
      const { data: outlet } = await admin
        .from("outlets")
        .select("id")
        .eq("id", input.outletId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!outlet) return { ok: false, message: "Invalid outlet." };
    }

    const { error } = await admin
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        role: input.role,
        outlet_id: input.outletId ?? null,
        is_active: input.isActive,
      })
      .eq("id", userId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/settings/users");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update user failed",
    };
  }
}

export async function setDefaultOutlet(
  outletId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { organizationId } = await requireManager();
    const admin = createAdminSupabaseClient();

    const outlets = await adminListOutletsForOrg(organizationId);
    if (!outlets.some((o) => o.id === outletId)) {
      return { ok: false, message: "Outlet not found." };
    }

    const clear = await admin
      .from("outlets")
      .update({ is_default: false })
      .eq("organization_id", organizationId);
    if (clear.error?.message?.includes("is_default")) {
      return { ok: false, message: MIGRATION_HINT };
    }

    const { error } = await admin
      .from("outlets")
      .update({ is_default: true })
      .eq("id", outletId)
      .eq("organization_id", organizationId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/settings/outlets");
    revalidatePath("/settings/general");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not set default outlet",
    };
  }
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", "expense_categories")
    .maybeSingle();
  return parseExpenseCategoriesJson(data?.value ?? null);
}

export async function addExpenseCategory(
  label: string
): Promise<{ ok: true; category: ExpenseCategory } | { ok: false; message: string }> {
  try {
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      return { ok: false, message: "Category name is too short." };
    }
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const categories = await listExpenseCategories();
    const id = slugifyExpenseCategory(trimmed);
    if (categories.some((c) => c.id === id)) {
      return { ok: false, message: "That category already exists." };
    }
    const next = [...categories, { id, label: trimmed }];
    const { error } = await supabase.from("settings").upsert(
      {
        organization_id: ctx.organizationId,
        key: "expense_categories",
        value: serializeExpenseCategories(next),
      },
      { onConflict: "organization_id,key" }
    );
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/general");
    revalidatePath("/pos");
    return { ok: true, category: { id, label: trimmed } };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not add category",
    };
  }
}

export async function removeExpenseCategory(
  categoryId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { organizationId } = await requireManager();
    const supabase = await createServerSupabaseClient();
    const categories = await listExpenseCategories();
    const id = categoryId.trim().toLowerCase();
    if (DEFAULT_EXPENSE_CATEGORIES.some((c) => c.id === id)) {
      return { ok: false, message: "Built-in categories cannot be removed." };
    }
    const next = categories.filter((c) => c.id !== id);
    if (next.length === categories.length) {
      return { ok: false, message: "Category not found." };
    }
    const { error } = await supabase.from("settings").upsert(
      {
        organization_id: organizationId,
        key: "expense_categories",
        value: serializeExpenseCategories(next),
      },
      { onConflict: "organization_id,key" }
    );
    if (error) return { ok: false, message: error.message };
    revalidatePath("/settings/general");
    revalidatePath("/pos");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not remove category",
    };
  }
}

/** Idempotent default settings for existing orgs (call after migration). */
export async function seedOrgSettingsIfMissing(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    const ctx = await requireOrgContext();
    const admin = createAdminSupabaseClient();
    const { error } = await admin.rpc("seed_default_org_settings", {
      p_org_id: ctx.organizationId,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Seed failed",
    };
  }
}
