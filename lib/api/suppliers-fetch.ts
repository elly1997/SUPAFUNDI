import type {
  SupplierDetail,
  SupplierListRow,
  SupplierReceiptRow,
} from "@/lib/actions/suppliers";

export type SupplierOption = { id: string; name: string };

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

/** Full supplier list for registry, payables, dropdowns. */
export async function fetchSuppliers(): Promise<SupplierListRow[]> {
  const res = await fetch("/api/suppliers", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { suppliers: SupplierListRow[] };
  return body.suppliers ?? [];
}

export async function fetchSupplierReceipts(
  supplierId: string
): Promise<SupplierReceiptRow[]> {
  const res = await fetch(`/api/suppliers/${supplierId}/receipts`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { receipts: SupplierReceiptRow[] };
  return body.receipts ?? [];
}

export async function fetchSupplierDetail(
  id: string
): Promise<SupplierDetail | null> {
  const res = await fetch(`/api/suppliers/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(await readJsonError(res));
  }
  const body = (await res.json()) as { supplier: SupplierDetail };
  return body.supplier ?? null;
}

export async function fetchSupplierOptions(): Promise<SupplierOption[]> {
  const rows = await fetchSuppliers();
  return rows
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: s.id, name: s.name }));
}

export async function createSupplierApi(params: {
  name: string;
  phone?: string;
  contactPerson?: string;
  openingBalance?: number;
  openingBalanceDate?: string;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/suppliers/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let body: { ok: true; id: string } | { ok: false; message?: string; error?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Create failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        ("message" in body && body.message) ||
        ("error" in body && body.error) ||
        res.statusText ||
        "Create failed",
    };
  }
  if (body.ok && "id" in body) return { ok: true, id: body.id };
  return {
    ok: false,
    message: ("message" in body && body.message) || "Create failed",
  };
}

/** Invalidate every supplier-related React Query cache key. */
export const SUPPLIER_QUERY_KEYS = [
  "suppliers",
  "pos-suppliers",
  "suppliers-list",
] as const;

export function invalidateSupplierQueries(
  queryClient: { invalidateQueries: (opts: { queryKey: string[] }) => void }
) {
  for (const key of SUPPLIER_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export async function updateSupplierApi(
  id: string,
  params: {
    name: string;
    phone?: string;
    contactPerson?: string;
    email?: string;
    address?: string;
    creditLimit?: number;
    creditDays?: number;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  let body: { ok: true } | { ok: false; message?: string; error?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Update failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        ("message" in body && body.message) ||
        ("error" in body && body.error) ||
        res.statusText ||
        "Update failed",
    };
  }
  if (body.ok) return { ok: true };
  return {
    ok: false,
    message: ("message" in body && body.message) || "Update failed",
  };
}

export async function deleteSupplierApi(
  id: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`/api/suppliers/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  let body: { ok: true } | { ok: false; message?: string; error?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Delete failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message:
        ("message" in body && body.message) ||
        ("error" in body && body.error) ||
        res.statusText ||
        "Delete failed",
    };
  }
  if (body.ok) return { ok: true };
  return {
    ok: false,
    message: ("message" in body && body.message) || "Delete failed",
  };
}
