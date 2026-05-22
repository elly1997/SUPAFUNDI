import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedAccountingForOrganization } from "@/lib/actions/accounting";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export const organizationSetupInputSchema = z.object({
  organizationName: z.string().min(2).max(200),
  outletName: z.string().min(2).max(200),
  phone: z.string().max(40).optional(),
  currency: z.string().length(3).default("TZS"),
  country: z.string().length(2).default("TZ"),
});

export type OrganizationSetupInput = z.infer<
  typeof organizationSetupInputSchema
>;

export type SetupResult =
  | { ok: true }
  | { ok: false; message: string };

export async function runCompleteOrganizationSetup(
  user: User,
  supabase: SupabaseClient<Database>,
  raw: unknown
): Promise<SetupResult> {
  try {
    const input = organizationSetupInputSchema.parse(raw);

    const { data: existing } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (existing?.organization_id) {
      return { ok: false, message: "Organization already configured." };
    }

    const admin = createAdminSupabaseClient();

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: input.organizationName.trim(),
        phone: input.phone?.trim() || null,
        currency: input.currency,
        country: input.country,
      })
      .select("id")
      .single();
    if (orgError || !org) {
      return {
        ok: false,
        message: orgError?.message ?? "Could not create organization.",
      };
    }

    const outletName = input.outletName.trim();
    const { data: outlet, error: outletError } = await admin
      .from("outlets")
      .insert({
        organization_id: org.id,
        name: outletName,
        code: "MAIN",
        is_default: true,
        is_active: true,
      })
      .select("id")
      .single();
    if (outletError || !outlet) {
      return {
        ok: false,
        message: outletError?.message ?? "Could not create outlet.",
      };
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({
        organization_id: org.id,
        outlet_id: outlet.id,
        role: "owner",
      })
      .eq("id", user.id);
    if (profileError) {
      return { ok: false, message: profileError.message };
    }

    const accountingSeed = await seedAccountingForOrganization(org.id);
    if (!accountingSeed.ok) {
      return { ok: false, message: accountingSeed.message };
    }

    const { error: settingsError } = await admin.from("settings").upsert(
      [
        { organization_id: org.id, key: "default_vat_rate", value: "18" },
        { organization_id: org.id, key: "vat_enabled", value: "false" },
        {
          organization_id: org.id,
          key: "receipt_footer",
          value: "Thank you for your business.",
        },
        { organization_id: org.id, key: "require_cash_session", value: "false" },
      ],
      { onConflict: "organization_id,key" }
    );
    if (settingsError) {
      return { ok: false, message: settingsError.message };
    }

    const { error: ownerEmailErr } = await admin
      .from("profiles")
      .update({ email: user.email?.toLowerCase() ?? null })
      .eq("id", user.id);
    if (ownerEmailErr) {
      return { ok: false, message: ownerEmailErr.message };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Setup failed",
    };
  }
}
