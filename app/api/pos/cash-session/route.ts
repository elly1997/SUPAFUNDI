import { NextResponse } from "next/server";
import { getDrawerStatus } from "@/lib/actions/cash-sessions";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const url = new URL(request.url);
    const outletId = url.searchParams.get("outletId");
    const businessDate = url.searchParams.get("businessDate") ?? undefined;
    if (!outletId) {
      return NextResponse.json(
        { error: "outletId is required" },
        { status: 400 }
      );
    }
    const drawer = await getDrawerStatus(outletId, businessDate);
    return NextResponse.json({ drawer, session: drawer.session });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load session";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
