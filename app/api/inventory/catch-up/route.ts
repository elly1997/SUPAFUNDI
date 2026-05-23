import { NextResponse } from "next/server";
import { listCatchUpDays } from "@/lib/actions/catch-up";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    const fromDate = params.get("fromDate");
    const toDate = params.get("toDate");
    if (!outletId || !fromDate || !toDate) {
      return NextResponse.json(
        { error: "outletId, fromDate, and toDate are required" },
        { status: 400 }
      );
    }
    const days = await listCatchUpDays(outletId, fromDate, toDate);
    return NextResponse.json({ days });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load catch-up";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
