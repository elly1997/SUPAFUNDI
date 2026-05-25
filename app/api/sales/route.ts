import { NextResponse } from "next/server";
import { listSalesPage } from "@/lib/actions/sales";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const result = await listSalesPage({
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 50),
      fromDate: params.get("fromDate") ?? undefined,
      toDate: params.get("toDate") ?? undefined,
      invoiceSearch: params.get("invoiceSearch") ?? undefined,
      outletId: params.get("outletId") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load sales";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
