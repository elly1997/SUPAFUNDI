import { NextResponse } from "next/server";
import { closeCashSession } from "@/lib/actions/cash-sessions";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      sessionId?: string;
      closingBalance?: number;
      businessDate?: string;
      notes?: string;
    };
    if (!body.sessionId) {
      return NextResponse.json(
        { ok: false, message: "sessionId is required" },
        { status: 400 }
      );
    }
    const result = await closeCashSession({
      sessionId: body.sessionId,
      closingBalance: Number(body.closingBalance) || 0,
      businessDate: body.businessDate,
      notes: body.notes,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Close session failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
