import { NextResponse } from "next/server";
import { getSupplierDetail } from "@/lib/actions/suppliers";
import { requireOrgContext } from "@/lib/server/org-context";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireOrgContext();
    const { id } = await params;
    const supplier = await getSupplierDetail(id);
    if (!supplier) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ supplier });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load supplier";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
