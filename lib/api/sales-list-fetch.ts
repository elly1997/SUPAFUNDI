import type { SalesPageResult } from "@/lib/actions/sales";

export async function fetchSalesPage(params: {
  page: number;
  pageSize: number;
  fromDate: string;
  toDate: string;
  invoiceSearch?: string;
  outletId?: string | null;
}): Promise<SalesPageResult> {
  const q = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    fromDate: params.fromDate,
    toDate: params.toDate,
  });
  if (params.invoiceSearch?.trim()) {
    q.set("invoiceSearch", params.invoiceSearch.trim());
  }
  if (params.outletId) q.set("outletId", params.outletId);

  const res = await fetch(`/api/sales?${q}`, {
    credentials: "include",
  });
  const body = (await res.json()) as SalesPageResult & { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load sales");
  }
  return body;
}
