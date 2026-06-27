import "server-only";

type AtRecipient = {
  number?: string;
  status?: string;
  statusCode?: number;
  messageId?: string;
  cost?: string;
};

type AtResponse = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: AtRecipient[];
  };
};

function apiBaseUrl(): string {
  if (process.env.AT_SANDBOX === "true") {
    return "https://api.sandbox.africastalking.com";
  }
  return process.env.AT_API_URL ?? "https://api.africastalking.com";
}

export function isSmsConfigured(): boolean {
  return Boolean(process.env.AT_API_KEY?.trim() && process.env.AT_USERNAME?.trim());
}

export async function sendViaAfricasTalking(params: {
  to: string;
  message: string;
}): Promise<
  | { ok: true; messageId: string; providerStatus: string }
  | { ok: false; message: string }
> {
  const apiKey = process.env.AT_API_KEY?.trim();
  const username = process.env.AT_USERNAME?.trim();
  if (!apiKey || !username) {
    return {
      ok: false,
      message:
        "SMS not configured. Set AT_API_KEY and AT_USERNAME in server environment.",
    };
  }

  const body = new URLSearchParams({
    username,
    to: params.to,
    message: params.message,
  });
  const senderId = process.env.AT_SENDER_ID?.trim();
  if (senderId) body.set("from", senderId);

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/version1/messaging`, {
      method: "POST",
      headers: {
        apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "SMS network error",
    };
  }

  let json: AtResponse | null = null;
  const text = await res.text();
  try {
    json = text ? (JSON.parse(text) as AtResponse) : null;
  } catch {
    return {
      ok: false,
      message: res.ok
        ? "Invalid SMS provider response"
        : `SMS failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const recipient = json?.SMSMessageData?.Recipients?.[0];
  const status = recipient?.status ?? "";
  const statusCode = recipient?.statusCode ?? 0;

  if (res.ok && (status === "Success" || statusCode === 101)) {
    return {
      ok: true,
      messageId: recipient?.messageId ?? "",
      providerStatus: status || String(statusCode),
    };
  }

  const providerMsg =
    json?.SMSMessageData?.Message ??
    recipient?.status ??
    text.slice(0, 200) ??
    `HTTP ${res.status}`;
  return { ok: false, message: providerMsg };
}
