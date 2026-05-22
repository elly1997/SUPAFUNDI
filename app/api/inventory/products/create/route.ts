import { NextResponse } from "next/server";
import { createProduct } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      name?: string;
      outletId?: string;
      categoryName?: string;
      unit?: string;
      costPrice?: number;
      retailPrice?: number;
      code?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Product name is required" },
        { status: 400 }
      );
    }
    if (!body.outletId) {
      return NextResponse.json(
        { ok: false, message: "Outlet is required" },
        { status: 400 }
      );
    }
    const cost = Number(body.costPrice) || 0;
    const explicitRetail =
      body.retailPrice != null && Number.isFinite(Number(body.retailPrice))
        ? Number(body.retailPrice)
        : null;

    const result = await createProduct({
      name: body.name.trim(),
      categoryId: null,
      categoryName: body.categoryName?.trim() || "General",
      unit: body.unit?.trim() || "pcs",
      code: body.code?.trim() || undefined,
      retailPrice:
        explicitRetail != null && explicitRetail > 0 ? explicitRetail : 0,
      costPrice: Math.max(0, cost),
      quantity: 0,
      outletId: body.outletId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
