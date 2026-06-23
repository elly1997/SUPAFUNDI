import type {
  ProductPriceCatalogPage,
  ProductPriceCatalogRow,
} from "@/lib/actions/inventory";
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

async function readJsonBody<T>(
  res: Response
): Promise<{ data: T | null; message?: string }> {
  const text = (await res.text()).trim();
  if (!text) {
    return {
      data: null,
      message: `Server returned ${res.status} with an empty response.`,
    };
  }
  if (text.startsWith("<")) {
    return {
      data: null,
      message:
        res.status === 404
          ? "Apply retail API not found — restart the dev server or redeploy."
          : `Server returned ${res.status} (HTML error page instead of JSON).`,
    };
  }
  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return {
      data: null,
      message: `Server returned ${res.status}: ${text.slice(0, 160)}`,
    };
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
  const { data: body, message: parseMessage } =
    await readJsonBody<ApplyRetailResult>(res);
  if (!body) {
    return { ok: false, message: parseMessage ?? "Could not apply retail prices" };
  }
  if (!res.ok || !body.ok) {
    const message =
      body.ok === false ? body.message : "Could not apply retail prices";
    return { ok: false, message: message ?? "Could not apply retail prices" };
  }
  return body;
}

export async function fetchInventoryCategories(): Promise<
  { id: string; name: string }[]
> {
  const res = await fetch("/api/inventory/categories", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as {
    categories: { id: string; name: string }[];
  };
  return body.categories ?? [];
}

export async function createProductApi(params: {
  name: string;
  outletId: string;
  categoryId?: string | null;
  categoryName?: string;
  unit?: string;
  costPrice?: number;
  retailPrice?: number;
  quantity?: number;
  code?: string;
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

export async function fetchProductPriceCatalogPage(params: {
  outletId?: string | null;
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string | null;
}): Promise<ProductPriceCatalogPage> {
  const q = new URLSearchParams();
  if (params.outletId) q.set("outletId", params.outletId);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.categoryId && params.categoryId !== "all") {
    q.set("categoryId", params.categoryId);
  }
  const res = await fetch(`/api/inventory/catalog?${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ProductPriceCatalogPage>;
}

export async function patchCatalogField(params: {
  productId: string;
  outletId?: string;
  field: "code" | "unit" | "costPrice" | "retailPrice";
  value: string | number;
  reason?: string;
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
  reason?: string;
}): Promise<void> {
  const res = await fetch("/api/inventory/stock-qty", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function deleteProductApi(
  productId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/inventory/products/${productId}`, {
    method: "DELETE",
    credentials: "include",
  });
  const body = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok || !body.ok) {
    return { ok: false, message: body.message ?? "Could not delete product" };
  }
  return { ok: true };
}
