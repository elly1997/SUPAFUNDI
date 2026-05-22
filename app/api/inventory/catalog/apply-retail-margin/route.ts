import { NextResponse } from "next/server";
import { applyMissingRetailPrices } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    let outletId: string | null = ctx.outletId;
    try {
      const body = (await request.json()) as { outletId?: string };
      if (body.outletId) outletId = body.outletId;
    } catch {
      /* empty body ok */
    }
    const result = await applyMissingRetailPrices(outletId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
