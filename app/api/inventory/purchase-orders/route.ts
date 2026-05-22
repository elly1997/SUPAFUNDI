import { NextResponse } from "next/server";
import { listPurchaseOrders } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const orders = await listPurchaseOrders();
    return NextResponse.json({ orders });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load purchase orders";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
