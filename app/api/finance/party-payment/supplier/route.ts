import { NextResponse } from "next/server";
import { paySupplier } from "@/lib/actions/suppliers";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = await request.json();
    const result = await paySupplier(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payment failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
