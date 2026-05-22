import { NextResponse } from "next/server";
import { openCashSession } from "@/lib/actions/cash-sessions";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      outletId?: string;
      openingBalance?: number;
      businessDate?: string;
      notes?: string;
    };
    if (!body.outletId) {
      return NextResponse.json(
        { ok: false, message: "outletId is required" },
        { status: 400 }
      );
    }
    const result = await openCashSession({
      outletId: body.outletId,
      openingBalance: Number(body.openingBalance) || 0,
      businessDate: body.businessDate,
      notes: body.notes,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Open session failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
