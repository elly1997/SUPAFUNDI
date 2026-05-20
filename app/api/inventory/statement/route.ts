import { NextResponse } from "next/server";
import { getProductItemStatement } from "@/lib/actions/stock";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const productId = params.get("productId");
    const outletId = params.get("outletId");
    if (!productId || !outletId) {
      return NextResponse.json(
        { error: "productId and outletId are required" },
        { status: 400 }
      );
    }
    const lines = await getProductItemStatement(productId, outletId);
    return NextResponse.json({ lines });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load statement";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
