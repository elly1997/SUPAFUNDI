import type { StockLevelsPage, StockStatus } from "@/lib/actions/stock";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchStockLevelsPage(params: {
  outletId?: string | null;
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
  status?: StockStatus | "all";
}): Promise<StockLevelsPage> {
  const q = new URLSearchParams();
  if (params.outletId) q.set("outletId", params.outletId);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.categoryId && params.categoryId !== "all") {
    q.set("categoryId", params.categoryId);
  }
  if (params.status && params.status !== "all") {
    q.set("status", params.status);
  }
  const res = await fetch(`/api/inventory/stock-levels?${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json() as Promise<StockLevelsPage>;
}
