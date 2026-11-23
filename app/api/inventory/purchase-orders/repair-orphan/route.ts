import { NextResponse } from "next/server";
import { repairOrphanReceivedPurchaseOrder } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as { poId?: string };
    if (!body.poId) {
      return NextResponse.json(
        { ok: false, message: "poId is required" },
        { status: 400 }
      );
    }
    const result = await repairOrphanReceivedPurchaseOrder(body.poId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Repair failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
