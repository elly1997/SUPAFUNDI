import { parseStkCallback } from "@/lib/mpesa";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const result = parseStkCallback(payload);

    if (result.success && result.mpesaReceipt) {
      try {
        const admin = createAdminSupabaseClient();
        const checkoutId =
          (payload as { Body?: { stkCallback?: { CheckoutRequestID?: string } } })
            ?.Body?.stkCallback?.CheckoutRequestID;
        if (checkoutId) {
          await admin
            .from("payments")
            .update({
              status: "completed",
              reference_no: result.mpesaReceipt,
            })
            .eq("reference_no", checkoutId)
            .eq("payment_method", "mpesa");
        }
      } catch {
        /* admin client optional in dev */
      }
    }

    return NextResponse.json({
      ResultCode: result.success ? 0 : 1,
      ResultDesc: result.resultDesc ?? "Accepted",
    });
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
}
