import { NextResponse } from "next/server";
import { listCustomersWithBalance } from "@/lib/actions/credit";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const customers = await listCustomersWithBalance();
    return NextResponse.json({ customers });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load credit balances";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
