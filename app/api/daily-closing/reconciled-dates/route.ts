import { NextResponse } from "next/server";
import { getReconciledDatesInRange } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";
import { todayIso } from "@/lib/utils/iso-date";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    const fromDate = params.get("fromDate") ?? "2020-01-01";
    const toDate = params.get("toDate") ?? todayIso();
    const dates = await getReconciledDatesInRange(
      fromDate,
      toDate,
      outletId || null
    );
    return NextResponse.json({ dates });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load reconciled dates";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
