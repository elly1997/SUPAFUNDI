import { NextResponse } from "next/server";
import { listExpenses, recordExpense } from "@/lib/actions/expenses";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit")) || 50;
    const outletId = searchParams.get("outletId") || undefined;
    const fromDate = searchParams.get("fromDate") || undefined;
    const toDate = searchParams.get("toDate") || undefined;
    const expenses = await listExpenses(limit, {
      outletId: outletId ?? null,
      fromDate,
      toDate,
    });
    return NextResponse.json({ expenses });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load expenses";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = await request.json();
    const result = await recordExpense(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Expense failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
