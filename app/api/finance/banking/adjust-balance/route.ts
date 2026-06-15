import { NextResponse } from "next/server";
import { adjustPaymentAccountBalance } from "@/lib/actions/banking";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      bankAccountId?: string;
      newBalance?: number;
      reason?: string;
      adminPassword?: string;
    };

    const result = await adjustPaymentAccountBalance({
      bankAccountId: body.bankAccountId ?? "",
      newBalance: Number(body.newBalance),
      reason: body.reason ?? "",
      adminPassword: body.adminPassword ?? "",
    });

    if (!result.ok) {
      const status = result.message.includes("password")
        ? 403
        : result.message.includes("owners and managers")
          ? 403
          : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Balance adjustment failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
