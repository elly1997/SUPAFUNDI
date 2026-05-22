import { NextResponse } from "next/server";
import { createManualSupplierBill } from "@/lib/actions/payables";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = await request.json();
    const result = await createManualSupplierBill(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bill create failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
