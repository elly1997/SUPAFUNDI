import { NextResponse } from "next/server";
import { listPosCatalogProducts } from "@/lib/actions/pos";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    if (!outletId) {
      return NextResponse.json(
        { error: "outletId is required" },
        { status: 400 }
      );
    }
    const products = await listPosCatalogProducts({
      outletId,
      q: params.get("q"),
      categoryId: params.get("categoryId"),
      limit: Number(params.get("limit") ?? 80),
    });
    return NextResponse.json({ products });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load POS catalog";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
