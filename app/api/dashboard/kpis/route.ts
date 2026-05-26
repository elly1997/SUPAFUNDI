import { NextResponse } from "next/server";
import { getDashboardKpis } from "@/lib/actions/dashboard";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const kpis = await getDashboardKpis(
      params.get("outletId"),
      params.get("businessDate")
    );
    return NextResponse.json({ kpis });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load dashboard KPIs";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
