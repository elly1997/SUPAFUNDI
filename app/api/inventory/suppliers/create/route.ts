import { NextResponse } from "next/server";
import { createSupplier } from "@/lib/actions/purchase-orders";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const { name } = (await request.json()) as { name?: string };
    if (!name?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Name is required" },
        { status: 400 }
      );
    }
    const result = await createSupplier(name.trim());
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
