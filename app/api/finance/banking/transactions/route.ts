import { NextResponse } from "next/server";
import { listBankTransactions } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const accountId = new URL(request.url).searchParams.get("accountId");
    const transactions = await listBankTransactions(
      accountId && accountId !== "all" ? accountId : null
    );
    return NextResponse.json({ transactions });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load transactions";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
