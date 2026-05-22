import { NextResponse } from "next/server";
import { listUnreconciledDays } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    const limit = Number(params.get("limit") ?? 30);
    const days = await listUnreconciledDays(outletId, limit);
    return NextResponse.json({ days });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load days";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
