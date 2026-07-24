"use server";

import { createHash, randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import {
  isSmsConfigured,
  sendViaAfricasTalking,
} from "@/lib/sms/africas-talking";
import { normalizeTzPhone } from "@/lib/sms/phone";

const OTP_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

async function resolveOwnerContact(organizationId: string): Promise<{
  phone: string | null;
  name: string | null;
}> {
  const admin = createAdminSupabaseClient();
  const { data: owner } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: org } = await admin
    .from("organizations")
    .select("phone, name")
    .eq("id", organizationId)
    .maybeSingle();

  const rawPhone = owner?.phone?.trim() || org?.phone?.trim() || null;
  return {
    phone: rawPhone ? normalizeTzPhone(rawPhone) : null,
    name: owner?.full_name ?? org?.name ?? null,
  };
}

export type IssueOutletAccessOtpResult =
  | {
      ok: true;
      code: string;
      expiresAt: string;
      outletName: string;
      userName: string;
      deliveredVia: "sms" | "manual";
      deliveryMessage: string;
    }
  | { ok: false; message: string };

/** Create an OTP for a user+outlet and send it to the owner (SMS when configured). */
export async function issueOutletAccessOtp(raw: {
  userId: string;
  outletId: string;
}): Promise<IssueOutletAccessOtpResult> {
  try {
    const input = z
      .object({
        userId: z.string().uuid(),
        outletId: z.string().uuid(),
      })
      .parse(raw);
    const { organizationId, userId: actorId } = await requireManagerContext();
    const admin = createAdminSupabaseClient();

    const { data: target } = await admin
      .from("profiles")
      .select("id, full_name, email, organization_id")
      .eq("id", input.userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!target) return { ok: false, message: "User not found." };

    const { data: outlet } = await admin
      .from("outlets")
      .select("id, name, is_active")
      .eq("id", input.outletId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!outlet) return { ok: false, message: "Invalid outlet." };

    const code = generateOtpCode();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

    // Invalidate prior unused OTPs for this user+outlet.
    await admin
      .from("outlet_access_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", input.userId)
      .eq("outlet_id", input.outletId)
      .is("consumed_at", null);

    const { error: insertErr } = await admin.from("outlet_access_otps").insert({
      organization_id: organizationId,
      user_id: input.userId,
      outlet_id: input.outletId,
      code_hash: hashOtp(code),
      created_by: actorId,
      expires_at: expiresAt,
    });
    if (insertErr) return { ok: false, message: insertErr.message };

    const contact = await resolveOwnerContact(organizationId);
    const message = `SUPAFUNDI: Outlet access code for ${target.full_name ?? target.email ?? "your staff"} at ${outlet.name} is ${code}. Valid 30 min. Share only with that user.`;

    let deliveredVia: "sms" | "manual" = "manual";
    let deliveryMessage =
      "Code created. Copy and share it with the user (SMS not configured or no owner phone).";

    if (contact.phone && isSmsConfigured()) {
      const sms = await sendViaAfricasTalking({
        to: contact.phone,
        message,
      });
      if (sms.ok) {
        deliveredVia = "sms";
        deliveryMessage = `Code sent by SMS to the owner. Share it with the user.`;
      } else {
        deliveryMessage = `SMS failed (${sms.message}). Use the code shown below.`;
      }
    }

    revalidatePath("/settings/users");
    return {
      ok: true,
      code,
      expiresAt,
      outletName: outlet.name,
      userName: target.full_name ?? target.email ?? "User",
      deliveredVia,
      deliveryMessage,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not issue access code",
    };
  }
}

/** Invited / staff user redeems an OTP to gain access to an outlet. */
export async function redeemOutletAccessOtp(
  codeRaw: string
): Promise<
  | { ok: true; outletId: string; outletName: string }
  | { ok: false; message: string }
> {
  try {
    const code = z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code")
      .parse(codeRaw);
    const ctx = await requireOrgContext();
    const admin = createAdminSupabaseClient();
    const codeHash = hashOtp(code);
    const now = new Date().toISOString();

    const { data: otp, error } = await admin
      .from("outlet_access_otps")
      .select("id, outlet_id, expires_at, consumed_at, organization_id")
      .eq("user_id", ctx.userId)
      .eq("organization_id", ctx.organizationId)
      .eq("code_hash", codeHash)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!otp) return { ok: false, message: "Invalid or already used code." };
    if (otp.expires_at < now) {
      return {
        ok: false,
        message: "This code has expired. Ask the owner for a new one.",
      };
    }

    const { data: outlet } = await admin
      .from("outlets")
      .select("id, name")
      .eq("id", otp.outlet_id)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!outlet) return { ok: false, message: "Outlet no longer exists." };

    const { error: grantErr } = await admin.from("user_outlet_access").upsert(
      {
        user_id: ctx.userId,
        outlet_id: outlet.id,
        organization_id: ctx.organizationId,
        granted_by: null,
        granted_at: now,
      },
      { onConflict: "user_id,outlet_id" }
    );
    if (grantErr) return { ok: false, message: grantErr.message };

    // Also set home outlet if the user has none yet.
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("outlet_id")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (!profile?.outlet_id) {
      await admin
        .from("profiles")
        .update({ outlet_id: outlet.id })
        .eq("id", ctx.userId);
    }

    await admin
      .from("outlet_access_otps")
      .update({ consumed_at: now })
      .eq("id", otp.id);

    revalidatePath("/", "layout");
    return { ok: true, outletId: outlet.id, outletName: outlet.name };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not redeem code",
    };
  }
}
