import { NextResponse } from "next/server";
import { getPurchaseOrderById } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireOrgContext();
    const { id } = await params;
    const order = await getPurchaseOrderById(id);
    if (!order) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load purchase order";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
