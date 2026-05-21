import type { ProductEditDetail } from "@/lib/actions/product-units";
import type { ProductUnitOption } from "@/lib/products/units";

export async function fetchProductUnitsMap(
  productIds: string[]
): Promise<Record<string, ProductUnitOption[]>> {
  if (!productIds.length) return {};
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
  return body.unitsByProduct ?? {};
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
}
