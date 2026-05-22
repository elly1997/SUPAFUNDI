import { NextResponse } from "next/server";
import { cancelPurchaseOrder } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const { poId } = (await request.json()) as { poId?: string };
    if (!poId) {
      return NextResponse.json(
        { ok: false, message: "poId required" },
        { status: 400 }
      );
    }
    const result = await cancelPurchaseOrder(poId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cancel failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
