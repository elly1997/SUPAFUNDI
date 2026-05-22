import { NextResponse } from "next/server";
import { listOpenPayables } from "@/lib/actions/payables";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const bills = await listOpenPayables();
    return NextResponse.json({ bills });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payables";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
