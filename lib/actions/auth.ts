"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { USER_ROLES } from "@/lib/auth/roles";
import {
  type OrganizationSetupInput,
  runCompleteOrganizationSetup,
} from "@/lib/setup/complete-organization";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2).max(200),
});

export async function signIn(
  raw: z.infer<typeof signInSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = signInSchema.parse(raw);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Sign in failed",
    };
  }
}

export type SignUpResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; message: string };

export async function signUp(
  raw: z.infer<typeof signUpSchema>
): Promise<SignUpResult> {
  try {
    const input = signUpSchema.parse(raw);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        data: { full_name: input.fullName.trim() },
      },
    });
    if (error) {
      return { ok: false, message: error.message };
    }
    if (!data.user) {
      return { ok: false, message: "Account could not be created." };
    }

    const profileRow = {
      id: data.user.id,
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      role: "owner" as const,
      is_active: true,
    };

    const { error: profileError } = await supabase.from("profiles").insert(
      profileRow
    );
    if (profileError) {
      const admin = createAdminSupabaseClient();
      const { error: adminProfileError } = await admin
        .from("profiles")
        .insert(profileRow);
      if (adminProfileError) {
        return { ok: false, message: adminProfileError.message };
      }
    }

    revalidatePath("/", "layout");
    return {
      ok: true,
      needsEmailConfirmation: !data.session,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Sign up failed",
    };
  }
}

export async function signOut(): Promise<{ ok: true }> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function completeOrganizationSetup(
  raw: OrganizationSetupInput
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return { ok: false, message: "You must be signed in." };
    }

    const result = await runCompleteOrganizationSetup(user, supabase, raw);
    if (result.ok) {
      revalidatePath("/", "layout");
    }
    return result;
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Setup failed",
    };
  }
}

export async function updateActiveOutlet(
  outletId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, message: "Not signed in." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.organization_id) {
      return { ok: false, message: "No organization on profile." };
    }
    if (profile.role !== "owner") {
      return { ok: false, message: "Only owners can switch outlets." };
    }

    const { data: outlet } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", outletId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, message: "Invalid outlet." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ outlet_id: outletId })
      .eq("id", user.id);
    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not update outlet",
    };
  }
}

export { USER_ROLES };
