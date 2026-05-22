import { NextResponse } from "next/server";
import { listCustomers } from "@/lib/actions/customers";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const customers = await listCustomers();
    return NextResponse.json({ customers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load customers";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
