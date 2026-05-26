import type { ProductEditDetail } from "@/lib/actions/product-units";
import type { ProductUnitOption } from "@/lib/products/units";

const PRODUCT_UNITS_CACHE_PREFIX = "supafundi_product_units_v2";
const PRODUCT_UNITS_CACHE_TTL = 5 * 60_000;

function unitCacheKey(productId: string) {
  return `${PRODUCT_UNITS_CACHE_PREFIX}:${productId}`;
}

function readCachedUnits(
  productIds: string[],
  allowStale = false
): Record<string, ProductUnitOption[]> | null {
  if (typeof window === "undefined") return null;
  const out: Record<string, ProductUnitOption[]> = {};
  try {
    for (const productId of productIds) {
      const raw = window.localStorage.getItem(unitCacheKey(productId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        units?: ProductUnitOption[];
        cachedAt?: number;
      };
      if (!Array.isArray(parsed.units)) return null;
      const fresh =
        typeof parsed.cachedAt === "number" &&
        Date.now() - parsed.cachedAt <= PRODUCT_UNITS_CACHE_TTL;
      if (!allowStale && !fresh) return null;
      out[productId] = parsed.units;
    }
    return out;
  } catch {
    return null;
  }
}

function writeCachedUnits(unitsByProduct: Record<string, ProductUnitOption[]>) {
  if (typeof window === "undefined") return;
  try {
    const cachedAt = Date.now();
    for (const [productId, units] of Object.entries(unitsByProduct)) {
      window.localStorage.setItem(
        unitCacheKey(productId),
        JSON.stringify({ units, cachedAt })
      );
    }
  } catch {
    /* Keep POS usable even when storage quota/private mode blocks writes. */
  }
}

function clearCachedUnits(productIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    for (const productId of productIds) {
      window.localStorage.removeItem(unitCacheKey(productId));
    }
  } catch {
    /* Ignore storage failures; server data was already saved. */
  }
}

export async function fetchProductUnitsMap(
  productIds: string[]
): Promise<Record<string, ProductUnitOption[]>> {
  if (!productIds.length) return {};
  const cached = readCachedUnits(productIds);
  if (cached) return cached;

  try {
    const res = await fetch("/api/inventory/product-units", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds }),
    });
    const body = (await res.json()) as {
      unitsByProduct?: Record<string, ProductUnitOption[]>;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(body.error ?? "Failed to load product units");
    }
    const unitsByProduct = body.unitsByProduct ?? {};
    writeCachedUnits(unitsByProduct);
    return unitsByProduct;
  } catch (e) {
    const stale = readCachedUnits(productIds, true);
    if (stale) return stale;
    throw e;
  }
}

export async function fetchProductEditDetail(
  productId: string
): Promise<ProductEditDetail> {
  const res = await fetch(`/api/inventory/products/${productId}/edit`, {
    credentials: "include",
  });
  const body = (await res.json()) as {
    product?: ProductEditDetail;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load product");
  }
  if (!body.product) throw new Error("Product not found");
  return body.product;
}

export async function saveProductEdit(
  productId: string,
  payload: {
    name: string;
    categoryId: string | null;
    units: {
      id?: string;
      unitLabel: string;
      factorToBase: number;
      isBase: boolean;
      unitsPerBase?: boolean;
      retailPrice?: number | null;
      wholesalePrice?: number | null;
      sortOrder?: number;
    }[];
  }
): Promise<void> {
  const res = await fetch(`/api/inventory/products/${productId}/edit`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as { error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Save failed");
  }
  clearCachedUnits([productId]);
}
