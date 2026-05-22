import { NextResponse } from "next/server";
import { lookupSaleByInvoice } from "@/lib/actions/sales";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const invoice = new URL(request.url).searchParams.get("invoice") ?? "";
    const sale = await lookupSaleByInvoice(invoice);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }
    return NextResponse.json({ sale });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
