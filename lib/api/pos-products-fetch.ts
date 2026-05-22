import type { PosCatalogRow } from "@/lib/actions/pos";

export async function fetchPosCatalog(
  outletId: string
): Promise<PosCatalogRow[]> {
  const res = await fetch(
    `/api/pos/products?outletId=${encodeURIComponent(outletId)}`,
    { credentials: "include", cache: "no-store" }
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
