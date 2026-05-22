import { NextResponse } from "next/server";
import { computeDayCashSummary } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    const businessDate = params.get("businessDate");
    if (!outletId || !businessDate) {
      return NextResponse.json(
        { error: "outletId and businessDate are required" },
        { status: 400 }
      );
    }
    const summary = await computeDayCashSummary(outletId, businessDate);
    return NextResponse.json({ summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load summary";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
