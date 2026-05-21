import { NextResponse } from "next/server";
import { listCustomerOpenInvoices } from "@/lib/actions/party-statements";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const customerId = new URL(request.url).searchParams.get("customerId");
    if (!customerId) {
      return NextResponse.json(
        { error: "customerId is required" },
        { status: 400 }
      );
    }
    const invoices = await listCustomerOpenInvoices(customerId);
    return NextResponse.json({ invoices });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load invoices";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
