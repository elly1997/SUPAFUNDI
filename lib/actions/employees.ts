"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function payrollDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

export type EmployeeRow = {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  job_title: string | null;
  gross_monthly_salary: number;
  is_active: boolean;
};

const employeeInput = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  jobTitle: z.string().max(100).optional(),
  grossMonthlySalary: z.coerce.number().nonnegative(),
  profileId: z.string().uuid().optional().nullable(),
});

export async function listEmployees(): Promise<EmployeeRow[]> {
  const ctx = await requireOrgContext();
  if (!ctx.outletId) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await payrollDb(supabase)
    .from("employees")
    .select(
      "id, profile_id, full_name, phone, job_title, gross_monthly_salary, is_active"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", ctx.outletId)
    .order("full_name");
  if (error) throw new Error(error.message);
  return ((data ?? []) as EmployeeRow[]).map((e) => ({
    id: e.id,
    profile_id: e.profile_id,
    full_name: e.full_name,
    phone: e.phone,
    job_title: e.job_title,
    gross_monthly_salary: Number(e.gross_monthly_salary),
    is_active: e.is_active,
  }));
}

export async function createEmployee(
  raw: z.infer<typeof employeeInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const input = employeeInput.parse(raw);
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return {
        ok: false,
        message: "Select a working outlet before creating employees.",
      };
    }
    const supabase = await createServerSupabaseClient();

    const { data, error } = await payrollDb(supabase)
      .from("employees")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        profile_id: input.profileId ?? null,
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        job_title: input.jobTitle?.trim() || null,
        gross_monthly_salary: input.grossMonthlySalary,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Could not create employee" };
    }

    revalidatePath("/finance/payroll");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create employee failed",
    };
  }
}

export async function updateEmployee(
  id: string,
  raw: z.infer<typeof employeeInput> & { isActive?: boolean }
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const input = employeeInput.parse(raw);
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return {
        ok: false,
        message: "Select a working outlet before updating employees.",
      };
    }
    const supabase = await createServerSupabaseClient();

    const { error } = await payrollDb(supabase)
      .from("employees")
      .update({
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        job_title: input.jobTitle?.trim() || null,
        gross_monthly_salary: input.grossMonthlySalary,
        profile_id: input.profileId ?? null,
        ...(raw.isActive !== undefined ? { is_active: raw.isActive } : {}),
      })
      .eq("id", id)
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId);
    if (error) return { ok: false, message: error.message };

    revalidatePath("/finance/payroll");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

export async function importEmployeesFromProfiles(): Promise<
  { ok: true; imported: number } | { ok: false; message: string }
> {
  try {
    await requireManagerContext();
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return {
        ok: false,
        message: "Select a working outlet before importing outlet staff.",
      };
    }
    const supabase = await createServerSupabaseClient();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone, is_active")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId)
      .eq("is_active", true);

    const { data: existing } = await payrollDb(supabase)
      .from("employees")
      .select("profile_id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId)
      .not("profile_id", "is", null);

    const linked = new Set(
      ((existing ?? []) as { profile_id: string | null }[])
        .map((e) => e.profile_id)
        .filter((id): id is string => Boolean(id))
    );
    let imported = 0;

    for (const p of profiles ?? []) {
      if (linked.has(p.id)) continue;
      const name = p.full_name?.trim();
      if (!name) continue;
      const { error } = await payrollDb(supabase).from("employees").insert({
        organization_id: ctx.organizationId,
        outlet_id: ctx.outletId,
        profile_id: p.id,
        full_name: name,
        phone: p.phone,
        gross_monthly_salary: 0,
        is_active: true,
      });
      if (!error) imported += 1;
    }

    revalidatePath("/finance/payroll");
    return { ok: true, imported };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Import failed",
    };
  }
}
