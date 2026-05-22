import { NextResponse } from "next/server";
import { getOpenCashSession } from "@/lib/actions/cash-sessions";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const outletId = new URL(request.url).searchParams.get("outletId");
    if (!outletId) {
      return NextResponse.json(
        { error: "outletId is required" },
        { status: 400 }
      );
    }
    const session = await getOpenCashSession(outletId);
    return NextResponse.json({ session });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load session";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
