import { NextResponse } from "next/server";
import { getCustomerCreditSummary } from "@/lib/actions/credit";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const summary = await getCustomerCreditSummary();
    return NextResponse.json({ summary });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load credit summary";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
