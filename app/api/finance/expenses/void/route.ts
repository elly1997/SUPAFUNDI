import { NextResponse } from "next/server";
import { voidExpense } from "@/lib/actions/expenses";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { expenseId?: string };
    if (!body.expenseId) {
      return NextResponse.json(
        { ok: false, message: "expenseId is required" },
        { status: 400 }
      );
    }
    const result = await voidExpense(body.expenseId);
    if (!result.ok) {
      const status = result.message.includes("signed in")
        ? 401
        : result.message.includes("owners and managers")
          ? 403
          : 400;
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Void expense failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
