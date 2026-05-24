import { NextResponse } from "next/server";
import { recordCashToBankDeposit } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      bankAccountId?: string;
      amount?: number;
      outletId?: string;
      businessDate?: string;
      description?: string;
      referenceNo?: string;
    };
    if (!body.bankAccountId) {
      return NextResponse.json(
        { ok: false, message: "Select a bank account" },
        { status: 400 }
      );
    }
    if (!body.outletId) {
      return NextResponse.json(
        { ok: false, message: "Outlet is required" },
        { status: 400 }
      );
    }
    const result = await recordCashToBankDeposit({
      bankAccountId: body.bankAccountId,
      amount: Number(body.amount),
      outletId: body.outletId,
      businessDate: body.businessDate ?? new Date().toISOString().slice(0, 10),
      description: body.description,
      referenceNo: body.referenceNo,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Deposit failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
