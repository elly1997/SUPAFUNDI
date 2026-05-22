import type {
  PurchaseOrderDetail,
  PurchaseOrderListRow,
} from "@/lib/actions/purchase-orders";

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchPurchaseOrders(): Promise<PurchaseOrderListRow[]> {
  const res = await fetch("/api/inventory/purchase-orders", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readJsonError(res));
  const body = (await res.json()) as { orders: PurchaseOrderListRow[] };
  return body.orders ?? [];
}

export async function fetchPurchaseOrderById(
  id: string
): Promise<PurchaseOrderDetail | null> {
  const res = await fetch(`/api/inventory/purchase-orders/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readJsonError(res));
  const body = (await res.json()) as { order: PurchaseOrderDetail };
  return body.order ?? null;
}

export async function createSupplierReturnApi(
  payload: Parameters<
    typeof import("@/lib/actions/supplier-returns").createSupplierReturn
  >[0]
): Promise<
  { ok: true; returnId: string } | { ok: false; message: string }
> {
  const res = await fetch("/api/inventory/supplier-returns", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: { ok: true; returnId: string } | { ok: false; message?: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, message: res.statusText || "Return failed" };
  }
  if (!res.ok) {
    return {
      ok: false,
      message: ("message" in body && body.message) || "Return failed",
    };
  }
  if (body.ok && "returnId" in body) return body;
  return {
    ok: false,
    message: ("message" in body && body.message) || "Return failed",
  };
}
