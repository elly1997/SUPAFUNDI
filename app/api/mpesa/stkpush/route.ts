import { z } from "zod";
import { initiateStkPush, getMpesaConfig } from "@/lib/mpesa";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  phone: z.string().min(9),
  amount: z.coerce.number().positive(),
  saleId: z.string().uuid().optional(),
  accountReference: z.string().max(12).optional(),
});

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Method not allowed" },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(request: Request) {
  try {
    const mpesa = getMpesaConfig();
    if (!mpesa.ok) {
      return NextResponse.json({ ok: false, error: mpesa.message }, { status: 503 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body" },
        { status: 400 }
      );
    }

    const ref =
      parsed.data.accountReference ??
      (parsed.data.saleId ? parsed.data.saleId.slice(0, 12) : "HPOS");

    const result = await initiateStkPush({
      phone: parsed.data.phone,
      amount: parsed.data.amount,
      accountReference: ref,
      transactionDesc: "HardwarePOS",
    });

    if (parsed.data.saleId) {
      await supabase
        .from("payments")
        .update({
          reference_no: result.checkoutRequestId,
          status: "pending",
        })
        .eq("sale_id", parsed.data.saleId)
        .eq("payment_method", "mpesa");
    }

    return NextResponse.json({
      ok: true,
      checkoutRequestId: result.checkoutRequestId,
      merchantRequestId: result.merchantRequestId,
      message: result.customerMessage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "STK push failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
