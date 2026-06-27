import type { SmsSettings } from "@/lib/actions/sms";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchSmsSettings(): Promise<SmsSettings> {
  const res = await fetch("/api/sms", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { settings: SmsSettings };
  return body.settings;
}

export async function previewCreditSmsApi(
  customerId: string
): Promise<{ message: string; phone: string | null }> {
  const q = new URLSearchParams({ customerId });
  const res = await fetch(`/api/sms?${q}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ message: string; phone: string | null }>;
}

export async function updateSmsSettingsApi(input: {
  creditTemplate: string;
  marketingTemplate: string;
  reminderCooldownDays: number;
  marketingEnabled: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/sms", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || body.error) {
    return { ok: false, message: body.error ?? "Could not save SMS settings" };
  }
  return { ok: true };
}

export async function sendCreditReminderApi(input: {
  customerId: string;
  messageOverride?: string;
  skipCooldown?: boolean;
}): Promise<{ ok: true } | { ok: false; message: string; skipped?: boolean }> {
  const res = await fetch("/api/sms?action=credit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    skipped?: boolean;
  };
  if (!res.ok || body.error) {
    return {
      ok: false,
      message: body.error ?? "Send failed",
      skipped: body.skipped,
    };
  }
  return { ok: true };
}

export async function sendBulkCreditRemindersApi(input?: {
  customerIds?: string[];
  skipCooldown?: boolean;
}): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  errors: { customerId: string; name: string; message: string }[];
}> {
  const res = await fetch("/api/sms?action=credit-bulk", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    sent: number;
    failed: number;
    skipped: number;
    errors: { customerId: string; name: string; message: string }[];
  }>;
}

export async function sendMarketingSmsApi(input: {
  message: string;
  customerIds: string[];
}): Promise<
  | {
      ok: true;
      sent: number;
      failed: number;
      errors: { customerId: string; name: string; message: string }[];
    }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/sms?action=marketing", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    sent?: number;
    failed?: number;
    errors?: { customerId: string; name: string; message: string }[];
  };
  if (!res.ok || body.error) {
    return { ok: false, message: body.error ?? "Send failed" };
  }
  return {
    ok: true,
    sent: body.sent ?? 0,
    failed: body.failed ?? 0,
    errors: body.errors ?? [],
  };
}
