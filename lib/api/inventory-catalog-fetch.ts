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

export async function applyMissingRetailPricesApi(
  outletId?: string | null
): Promise<
  | { ok: true; updated: number; marginPct: number }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/inventory/catalog/apply-retail-margin", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outletId: outletId ?? undefined }),
  });
  const body = (await res.json()) as
    | { ok: true; updated: number; marginPct: number }
    | { ok: false; message?: string };
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message:
        (body as { message?: string }).message ?? "Could not apply retail prices",
    };
  }
  return body;
}

export async function createProductQuickApi(params: {
  name: string;
  outletId: string;
  categoryName?: string;
  unit?: string;
  costPrice?: number;
  retailPrice?: number;
}): Promise<
  | { ok: true; productId: string; code?: string | null }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/inventory/products/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as
    | { ok: true; productId: string; code?: string | null }
    | { ok: false; message?: string };
  if (!res.ok || !body.ok) {
    return {
      ok: false,
      message:
        (body as { message?: string }).message ?? "Could not create product",
    };
  }
  return body;
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

export async function clearAllCatalogProducts(): Promise<{ deleted: number }> {
  const res = await fetch("/api/inventory/catalog/clear", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ deleted: number }>;
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
