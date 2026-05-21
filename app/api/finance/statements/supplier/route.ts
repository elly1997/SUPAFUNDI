import { NextResponse } from "next/server";
import { getSupplierStatement } from "@/lib/actions/party-statements";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const supplierId = new URL(request.url).searchParams.get("supplierId");
    if (!supplierId) {
      return NextResponse.json(
        { error: "supplierId is required" },
        { status: 400 }
      );
    }
    const lines = await getSupplierStatement(supplierId);
    return NextResponse.json({ lines });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load statement";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
