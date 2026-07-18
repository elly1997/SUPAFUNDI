import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getSmsSettings,
  previewCreditReminderSms,
  sendBulkCreditReminders,
  sendCustomerCreditReminder,
  sendMarketingSms,
  sendTestSms,
  updateSmsSettings,
} from "@/lib/actions/sms";
import { requireOrgContext } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customerId");
    if (customerId) {
      const preview = await previewCreditReminderSms(customerId);
      if (!preview.ok) {
        return NextResponse.json({ error: preview.message }, { status: 400 });
      }
      return NextResponse.json(preview);
    }
    const settings = await getSmsSettings();
    return NextResponse.json({ settings });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load SMS";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

const patchSchema = z.object({
  creditTemplate: z.string().min(10).max(480),
  marketingTemplate: z.string().min(10).max(480),
  reminderCooldownDays: z.coerce.number().int().min(1).max(30),
  marketingEnabled: z.boolean(),
});

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());
    const result = await updateSmsSettings(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("signed in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

const sendCreditSchema = z.object({
  customerId: z.string().uuid(),
  messageOverride: z.string().max(480).optional(),
  skipCooldown: z.boolean().optional(),
});

const sendBulkSchema = z.object({
  customerIds: z.array(z.string().uuid()).optional(),
  skipCooldown: z.boolean().optional(),
});

const sendMarketingSchema = z.object({
  message: z.string().min(5).max(320),
  customerIds: z.array(z.string().uuid()).min(1),
});

const testSmsSchema = z.object({
  phone: z.string().min(9).max(20),
});

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const json = await request.json();

    if (action === "credit") {
      const body = sendCreditSchema.parse(json);
      const result = await sendCustomerCreditReminder(body);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.message, skipped: result.skipped ?? false },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, message: result.message });
    }

    if (action === "credit-bulk") {
      const body = sendBulkSchema.parse(json);
      const result = await sendBulkCreditReminders(body);
      return NextResponse.json(result);
    }

    if (action === "marketing") {
      const body = sendMarketingSchema.parse(json);
      const result = await sendMarketingSms(body);
      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (action === "test") {
      const body = testSmsSchema.parse(json);
      const result = await sendTestSms(body);
      if (!result.ok) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Send failed";
    const status = message.includes("permission") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
