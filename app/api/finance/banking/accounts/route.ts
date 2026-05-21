import { NextResponse } from "next/server";
import { listPaymentAccounts } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const accounts = await listPaymentAccounts();
    return NextResponse.json({ accounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load accounts";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
