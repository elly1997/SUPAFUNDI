import { NextResponse } from "next/server";
import { listStockLevelsPage } from "@/lib/actions/stock";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const result = await listStockLevelsPage({
      outletId: params.get("outletId"),
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 50),
      search: params.get("search") ?? "",
      categoryId: params.get("categoryId"),
      status: (params.get("status") as "all" | "low" | "ok" | "out_of_stock") ?? "all",
    });
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load stock levels";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
