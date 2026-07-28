"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canSendCustomerSms } from "@/lib/auth/sms-permissions";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isSmsConfigured,
  sendViaAfricasTalking,
} from "@/lib/sms/africas-talking";
import { normalizeTzPhone } from "@/lib/sms/phone";
import {
  DEFAULT_CREDIT_SMS_TEMPLATE,
  DEFAULT_MARKETING_SMS_TEMPLATE,
  renderSmsTemplate,
} from "@/lib/sms/templates";
import { formatTzs } from "@/lib/utils/currency";
import { customerBalanceView } from "@/lib/utils/customer-balance";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function smsDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: "sms_messages" | "customer_sms_preferences") => ReturnType<
      Supabase["from"]
    >;
  };
}

export type SmsSettings = {
  creditTemplate: string;
  marketingTemplate: string;
  reminderCooldownDays: number;
  marketingEnabled: boolean;
  configured: boolean;
  shopPhone: string;
  shopName: string;
};

async function requireSmsSender() {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", ctx.userId)
    .maybeSingle();
  if (!canSendCustomerSms(profile?.role ?? null)) {
    throw new Error("You do not have permission to send customer SMS.");
  }
  return ctx;
}

async function loadSmsSettingsMap(
  supabase: Supabase,
  organizationId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .eq("organization_id", organizationId)
    .in("key", [
      "sms_credit_template",
      "sms_marketing_template",
      "sms_reminder_cooldown_days",
      "sms_marketing_enabled",
    ]);
  return new Map(
    (data ?? []).map((r) => [r.key, r.value ?? ""] as const)
  );
}

async function loadShopContext(supabase: Supabase, organizationId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("name, phone")
    .eq("id", organizationId)
    .maybeSingle();
  return {
    shopName: org?.name ?? "SUPAFUNDI TRADERS",
    shopPhone: org?.phone?.trim() ?? "",
  };
}

export async function getSmsSettings(): Promise<SmsSettings> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const map = await loadSmsSettingsMap(supabase, ctx.organizationId);
  const shop = await loadShopContext(supabase, ctx.organizationId);

  return {
    creditTemplate: map.get("sms_credit_template") ?? DEFAULT_CREDIT_SMS_TEMPLATE,
    marketingTemplate:
      map.get("sms_marketing_template") ?? DEFAULT_MARKETING_SMS_TEMPLATE,
    reminderCooldownDays: Number(map.get("sms_reminder_cooldown_days") ?? 7),
    marketingEnabled: map.get("sms_marketing_enabled") === "true",
    configured: isSmsConfigured(),
    shopPhone: shop.shopPhone,
    shopName: shop.shopName,
  };
}

const updateSmsSettingsSchema = z.object({
  creditTemplate: z.string().min(10).max(480),
  marketingTemplate: z.string().min(10).max(480),
  reminderCooldownDays: z.coerce.number().int().min(1).max(30),
  marketingEnabled: z.boolean(),
});

export async function updateSmsSettings(
  raw: z.infer<typeof updateSmsSettingsSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = updateSmsSettingsSchema.parse(raw);
    const ctx = await requireSmsSender();
    const supabase = await createServerSupabaseClient();

    const rows = [
      { key: "sms_credit_template", value: input.creditTemplate.trim() },
      { key: "sms_marketing_template", value: input.marketingTemplate.trim() },
      {
        key: "sms_reminder_cooldown_days",
        value: String(input.reminderCooldownDays),
      },
      {
        key: "sms_marketing_enabled",
        value: input.marketingEnabled ? "true" : "false",
      },
    ];

    for (const row of rows) {
      const { error } = await supabase.from("settings").upsert(
        {
          organization_id: ctx.organizationId,
          key: row.key,
          value: row.value,
        },
        { onConflict: "organization_id,key" }
      );
      if (error) return { ok: false, message: error.message };
    }

    revalidatePath("/settings/general");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not save SMS settings",
    };
  }
}

function buildCreditReminderBody(
  template: string,
  customerName: string,
  balance: number,
  shopPhone: string,
  shopName: string
): string {
  return renderSmsTemplate(template, {
    name: customerName,
    balance: formatTzs(balance),
    shopPhone: shopPhone || "duka letu",
    shopName,
  }).trim();
}

async function logSmsMessage(
  supabase: Supabase,
  params: {
    organizationId: string;
    customerId: string;
    phone: string;
    body: string;
    messageType: "credit_reminder" | "marketing" | "manual";
    status: "sent" | "failed";
    providerId?: string;
    providerStatus?: string;
    errorMessage?: string;
    sentBy: string;
  }
) {
  await smsDb(supabase).from("sms_messages").insert({
    organization_id: params.organizationId,
    customer_id: params.customerId,
    phone: params.phone,
    message_body: params.body,
    message_type: params.messageType,
    status: params.status,
    provider_id: params.providerId ?? null,
    provider_status: params.providerStatus ?? null,
    error_message: params.errorMessage ?? null,
    sent_by: params.sentBy,
  });
}

async function touchCreditReminder(
  supabase: Supabase,
  organizationId: string,
  customerId: string
) {
  const now = new Date().toISOString();
  await smsDb(supabase).from("customer_sms_preferences").upsert(
    {
      customer_id: customerId,
      organization_id: organizationId,
      last_credit_reminder_at: now,
    },
    { onConflict: "customer_id" }
  );
}

async function isWithinCooldown(
  supabase: Supabase,
  customerId: string,
  cooldownDays: number
): Promise<boolean> {
  const { data } = await smsDb(supabase)
    .from("customer_sms_preferences")
    .select("last_credit_reminder_at")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!data?.last_credit_reminder_at) return false;
  const last = new Date(data.last_credit_reminder_at).getTime();
  const ms = cooldownDays * 24 * 60 * 60 * 1000;
  return Date.now() - last < ms;
}

const sendCreditSchema = z.object({
  customerId: z.string().uuid(),
  messageOverride: z.string().max(480).optional(),
  skipCooldown: z.boolean().optional(),
});

export async function sendCustomerCreditReminder(
  raw: z.infer<typeof sendCreditSchema>
): Promise<
  | { ok: true; message: string }
  | { ok: false; message: string; skipped?: boolean }
> {
  try {
    const input = sendCreditSchema.parse(raw);
    const ctx = await requireSmsSender();
    if (!isSmsConfigured()) {
      return {
        ok: false,
        message:
          "SMS provider not configured. Add AT_API_KEY and AT_USERNAME to server environment.",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone, outstanding_balance, deposit_balance, is_active")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();

    if (!customer?.is_active) {
      return { ok: false, message: "Customer not found." };
    }

    const balance = customerBalanceView(
      Number(customer.outstanding_balance),
      Number(customer.deposit_balance ?? 0)
    ).netDue;
    if (balance <= 0) {
      return { ok: false, message: "Customer has no outstanding balance." };
    }

    const phone = customer.phone ? normalizeTzPhone(customer.phone) : null;
    if (!phone) {
      return { ok: false, message: "Customer has no valid mobile number." };
    }

    const settingsMap = await loadSmsSettingsMap(supabase, ctx.organizationId);
    const cooldownDays = Number(settingsMap.get("sms_reminder_cooldown_days") ?? 7);
    if (
      !input.skipCooldown &&
      (await isWithinCooldown(supabase, customer.id, cooldownDays))
    ) {
      return {
        ok: false,
        message: `Reminder already sent within the last ${cooldownDays} day(s).`,
        skipped: true,
      };
    }

    const shop = await loadShopContext(supabase, ctx.organizationId);
    const template =
      settingsMap.get("sms_credit_template") ?? DEFAULT_CREDIT_SMS_TEMPLATE;
    const body =
      input.messageOverride?.trim() ||
      buildCreditReminderBody(
        template,
        customer.name,
        balance,
        shop.shopPhone,
        shop.shopName
      );

    const result = await sendViaAfricasTalking({ to: phone, message: body });
    await logSmsMessage(supabase, {
      organizationId: ctx.organizationId,
      customerId: customer.id,
      phone,
      body,
      messageType: "credit_reminder",
      status: result.ok ? "sent" : "failed",
      providerId: result.ok ? result.messageId : undefined,
      providerStatus: result.ok ? result.providerStatus : undefined,
      errorMessage: result.ok ? undefined : result.message,
      sentBy: ctx.userId,
    });

    if (!result.ok) return { ok: false, message: result.message };

    await touchCreditReminder(supabase, ctx.organizationId, customer.id);
    revalidatePath("/customers");
    return { ok: true, message: body };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not send SMS",
    };
  }
}

const bulkCreditSchema = z.object({
  customerIds: z.array(z.string().uuid()).optional(),
  skipCooldown: z.boolean().optional(),
});

export async function sendBulkCreditReminders(
  raw: z.infer<typeof bulkCreditSchema>
): Promise<{
  ok: true;
  sent: number;
  failed: number;
  skipped: number;
  errors: { customerId: string; name: string; message: string }[];
}> {
  const input = bulkCreditSchema.parse(raw);
  const ctx = await requireSmsSender();
  const supabase = await createServerSupabaseClient();

  let targets: { id: string; name: string }[] = [];
  if (input.customerIds?.length) {
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .in("id", input.customerIds);
    targets = (data ?? []).map((c) => ({ id: c.id, name: c.name }));
  } else {
    const { resolveWorkingOutletId } = await import(
      "@/lib/customers/working-outlet"
    );
    const outletId = await resolveWorkingOutletId(ctx);
    let q = supabase
      .from("customers")
      .select("id, name")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .gt("outstanding_balance", 0);
    if (outletId) q = q.eq("outlet_id", outletId);
    const { data } = await q;
    targets = (data ?? []).map((c) => ({ id: c.id, name: c.name }));
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: { customerId: string; name: string; message: string }[] = [];

  for (const target of targets) {
    const result = await sendCustomerCreditReminder({
      customerId: target.id,
      skipCooldown: input.skipCooldown,
    });
    if (result.ok) {
      sent += 1;
    } else if ("skipped" in result && result.skipped) {
      skipped += 1;
    } else {
      failed += 1;
      errors.push({
        customerId: target.id,
        name: target.name,
        message: result.message,
      });
    }
  }

  return { ok: true, sent, failed, skipped, errors };
}

const marketingSchema = z.object({
  message: z.string().min(5).max(320),
  customerIds: z.array(z.string().uuid()).min(1),
});

export async function sendMarketingSms(
  raw: z.infer<typeof marketingSchema>
): Promise<{
  ok: true;
  sent: number;
  failed: number;
  errors: { customerId: string; name: string; message: string }[];
} | { ok: false; message: string }> {
  try {
    const input = marketingSchema.parse(raw);
    const ctx = await requireSmsSender();
    const settings = await getSmsSettings();
    if (!settings.marketingEnabled) {
      return {
        ok: false,
        message: "Marketing SMS is disabled in Settings.",
      };
    }
    if (!isSmsConfigured()) {
      return {
        ok: false,
        message: "SMS provider not configured.",
      };
    }

    const supabase = await createServerSupabaseClient();
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, phone, is_active")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .in("id", input.customerIds);

    let sent = 0;
    let failed = 0;
    const errors: { customerId: string; name: string; message: string }[] = [];

    for (const customer of customers ?? []) {
      const { data: prefs } = await smsDb(supabase)
        .from("customer_sms_preferences")
        .select("marketing_opt_in")
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (!prefs?.marketing_opt_in) {
        failed += 1;
        errors.push({
          customerId: customer.id,
          name: customer.name,
          message: "Not opted in to marketing SMS",
        });
        continue;
      }

      const phone = customer.phone ? normalizeTzPhone(customer.phone) : null;
      if (!phone) {
        failed += 1;
        errors.push({
          customerId: customer.id,
          name: customer.name,
          message: "No valid phone number",
        });
        continue;
      }

      const body = renderSmsTemplate(settings.marketingTemplate, {
        message: input.message.trim(),
        shopPhone: settings.shopPhone || "duka letu",
        shopName: settings.shopName,
        name: customer.name,
      }).trim();

      const result = await sendViaAfricasTalking({ to: phone, message: body });
      await logSmsMessage(supabase, {
        organizationId: ctx.organizationId,
        customerId: customer.id,
        phone,
        body,
        messageType: "marketing",
        status: result.ok ? "sent" : "failed",
        providerId: result.ok ? result.messageId : undefined,
        providerStatus: result.ok ? result.providerStatus : undefined,
        errorMessage: result.ok ? undefined : result.message,
        sentBy: ctx.userId,
      });

      if (result.ok) sent += 1;
      else {
        failed += 1;
        errors.push({
          customerId: customer.id,
          name: customer.name,
          message: result.message,
        });
      }
    }

    return { ok: true, sent, failed, errors };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not send marketing SMS",
    };
  }
}

export async function previewCreditReminderSms(
  customerId: string
): Promise<{ ok: true; message: string; phone: string | null } | { ok: false; message: string }> {
  try {
    await requireSmsSender();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone, outstanding_balance, deposit_balance")
      .eq("id", customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) return { ok: false, message: "Customer not found." };

    const balance = customerBalanceView(
      Number(customer.outstanding_balance),
      Number(customer.deposit_balance ?? 0)
    ).netDue;
    const settings = await getSmsSettings();
    const message = buildCreditReminderBody(
      settings.creditTemplate,
      customer.name,
      balance,
      settings.shopPhone,
      settings.shopName
    );
    const phone = customer.phone ? normalizeTzPhone(customer.phone) : null;
    return { ok: true, message, phone };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Preview failed",
    };
  }
}

const testSmsSchema = z.object({
  phone: z.string().min(9).max(20),
});

/** Verify Africa's Talking credentials by sending a test message. */
export async function sendTestSms(
  raw: z.infer<typeof testSmsSchema>
): Promise<{ ok: true; messageId: string } | { ok: false; message: string }> {
  try {
    const input = testSmsSchema.parse(raw);
    await requireSmsSender();
    if (!isSmsConfigured()) {
      return {
        ok: false,
        message:
          "SMS provider not configured. Add AT_API_KEY and AT_USERNAME to server environment.",
      };
    }

    const phone = normalizeTzPhone(input.phone);
    if (!phone) {
      return {
        ok: false,
        message:
          "Invalid Tanzania mobile number. Use 07XXXXXXXX or +2557XXXXXXXX.",
      };
    }

    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const shop = await loadShopContext(supabase, ctx.organizationId);
    const body = `${shop.shopName}: SMS test OK. Your Africa's Talking connection is working.`;

    const result = await sendViaAfricasTalking({ to: phone, message: body });
    if (!result.ok) return { ok: false, message: result.message };

    return { ok: true, messageId: result.messageId };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Test SMS failed",
    };
  }
}
