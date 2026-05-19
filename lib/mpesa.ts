import { z } from "zod";

const mpesaEnvSchema = z.object({
  MPESA_CONSUMER_KEY: z.string().min(1),
  MPESA_CONSUMER_SECRET: z.string().min(1),
  MPESA_SHORTCODE: z.string().min(1),
  MPESA_PASSKEY: z.string().min(1),
  MPESA_CALLBACK_URL: z.string().url(),
  MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
});

export type MpesaConfig = z.infer<typeof mpesaEnvSchema>;

export function getMpesaConfig():
  | { ok: true; config: MpesaConfig }
  | { ok: false; message: string } {
  const parsed = mpesaEnvSchema.safeParse({
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
    MPESA_ENV: process.env.MPESA_ENV ?? "sandbox",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "M-Pesa is not configured. Set MPESA_* variables in your environment.",
    };
  }
  return { ok: true, config: parsed.data };
}

function baseUrl(env: "sandbox" | "production"): string {
  return env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

export async function getMpesaAccessToken(
  config: MpesaConfig
): Promise<string> {
  const auth = Buffer.from(
    `${config.MPESA_CONSUMER_KEY}:${config.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const res = await fetch(
    `${baseUrl(config.MPESA_ENV)}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(`M-Pesa OAuth failed (${res.status})`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("M-Pesa OAuth returned no access token");
  }
  return body.access_token;
}

/** Daraja STK Push (Lipa na M-Pesa Online). */
export async function initiateStkPush(params: {
  phone: string;
  amount: number;
  accountReference: string;
  transactionDesc?: string;
}): Promise<{
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
}> {
  const env = getMpesaConfig();
  if (!env.ok) {
    throw new Error(env.message);
  }
  const config = env.config;
  const token = await getMpesaAccessToken(config);

  const phone = params.phone.replace(/\D/g, "");
  const msisdn = phone.startsWith("255")
    ? phone
    : phone.startsWith("0")
      ? `254${phone.slice(1)}`
      : `254${phone}`;

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const password = Buffer.from(
    `${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

  const res = await fetch(
    `${baseUrl(config.MPESA_ENV)}/mpesa/stkpush/v1/processrequest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.ceil(params.amount),
        PartyA: msisdn,
        PartyB: config.MPESA_SHORTCODE,
        PhoneNumber: msisdn,
        CallBackURL: config.MPESA_CALLBACK_URL,
        AccountReference: params.accountReference.slice(0, 12),
        TransactionDesc: (params.transactionDesc ?? "HardwarePOS").slice(
          0,
          13
        ),
      }),
    }
  );

  const body = (await res.json()) as {
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };
  if (!res.ok || !body.CheckoutRequestID) {
    throw new Error(
      body.errorMessage ?? `STK push failed (${res.status})`
    );
  }
  return {
    checkoutRequestId: body.CheckoutRequestID,
    merchantRequestId: body.MerchantRequestID ?? "",
    customerMessage: body.CustomerMessage ?? "Check your phone to pay.",
  };
}

export type StkCallbackResult = {
  success: boolean;
  amount?: number;
  mpesaReceipt?: string;
  phone?: string;
  resultDesc?: string;
};

/** Parse Daraja STK callback body. */
export function parseStkCallback(payload: unknown): StkCallbackResult {
  const body = payload as {
    Body?: {
      stkCallback?: {
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: {
          Item?: { Name?: string; Value?: string | number }[];
        };
      };
    };
  };
  const cb = body?.Body?.stkCallback;
  if (!cb) {
    return { success: false, resultDesc: "Invalid callback payload" };
  }
  if (cb.ResultCode !== 0) {
    return { success: false, resultDesc: cb.ResultDesc ?? "Payment failed" };
  }
  const items = cb.CallbackMetadata?.Item ?? [];
  const get = (name: string) =>
    items.find((i) => i.Name === name)?.Value;
  return {
    success: true,
    amount: Number(get("Amount") ?? 0),
    mpesaReceipt: String(get("MpesaReceiptNumber") ?? ""),
    phone: String(get("PhoneNumber") ?? ""),
    resultDesc: cb.ResultDesc,
  };
}
