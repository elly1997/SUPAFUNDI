import { NextResponse } from "next/server";
import { reverseBankTransaction } from "@/lib/actions/banking";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { transactionId?: string };
    const result = await reverseBankTransaction(body.transactionId ?? "");

    if (!result.ok) {
      const status = result.message.includes("owners and managers") ? 403 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reversal failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
