import type { ProductPriceCatalogRow } from "@/lib/actions/inventory";
import type { ItemStatementLine } from "@/lib/actions/stock";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchProductPriceCatalog(
  outletId?: string | null
): Promise<ProductPriceCatalogRow[]> {
  const q = outletId ? `?outletId=${encodeURIComponent(outletId)}` : "";
  const res = await fetch(`/api/inventory/catalog${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { products: ProductPriceCatalogRow[] };
  return body.products ?? [];
}

export async function patchCatalogField(params: {
  productId: string;
  outletId?: string;
  field: "code" | "unit" | "costPrice" | "retailPrice";
  value: string | number;
}): Promise<void> {
  const res = await fetch("/api/inventory/catalog", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchItemStatement(
  productId: string,
  outletId: string
): Promise<ItemStatementLine[]> {
  const q = new URLSearchParams({ productId, outletId });
  const res = await fetch(`/api/inventory/statement?${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { lines: ItemStatementLine[] };
  return body.lines ?? [];
}

export async function patchStockQuantity(params: {
  productId: string;
  outletId: string;
  quantity: number;
}): Promise<void> {
  const res = await fetch("/api/inventory/stock-qty", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
}
