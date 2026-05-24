import { NextResponse } from "next/server";
import { listCashDepositAccounts } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const accounts = await listCashDepositAccounts();
    return NextResponse.json({ accounts });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load bank accounts";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
