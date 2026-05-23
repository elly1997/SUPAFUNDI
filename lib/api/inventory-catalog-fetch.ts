import type { ProductPriceCatalogRow } from "@/lib/actions/inventory";
import type { ItemStatementLine } from "@/lib/actions/stock";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

type ApplyRetailResult =
  | { ok: true; updated: number; marginPct: number }
  | { ok: false; message: string };

async function parseJsonResponse<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function applyMissingRetailPricesApi(
  outletId?: string | null
): Promise<ApplyRetailResult> {
  const res = await fetch("/api/inventory/catalog/apply-retail-margin", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outletId: outletId ?? undefined }),
  });
  const body = await parseJsonResponse<ApplyRetailResult>(res);
  if (!body) {
    const hint =
      res.status === 404
        ? "Apply retail API not found — restart the dev server or redeploy."
        : `Server returned ${res.status} (expected JSON).`;
    return { ok: false, message: hint };
  }
  if (!res.ok || !body.ok) {
    const message =
      body.ok === false ? body.message : "Could not apply retail prices";
    return { ok: false, message: message ?? "Could not apply retail prices" };
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
