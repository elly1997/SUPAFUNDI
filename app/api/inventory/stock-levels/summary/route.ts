import { NextResponse } from "next/server";
import { getStockLevelsSummary } from "@/lib/actions/stock";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const outletId = new URL(request.url).searchParams.get("outletId");
    const summary = await getStockLevelsSummary(outletId);
    return NextResponse.json({ summary });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load stock summary";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
