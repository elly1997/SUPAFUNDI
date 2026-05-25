import type { PosCatalogRow } from "@/lib/actions/pos";

export async function fetchPosCatalog(
  outletId: string,
  params?: {
    q?: string;
    categoryId?: string | null;
    limit?: number;
  }
): Promise<PosCatalogRow[]> {
  const q = new URLSearchParams({ outletId });
  if (params?.q?.trim()) q.set("q", params.q.trim());
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  if (params?.limit) q.set("limit", String(params.limit));
  const res = await fetch(
    `/api/pos/products?${q}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    products?: PosCatalogRow[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load POS products");
  }
  return body.products ?? [];
}
