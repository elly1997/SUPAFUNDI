import type { DayCashSummary, UnreconciledDayRow } from "@/lib/actions/daily-closing";
import type { ReceiveGoodsInput } from "@/lib/actions/grn";
import type { CompleteSaleInput, CompleteSaleResult } from "@/lib/actions/sales";

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok) {
    const msg =
      (body as { error?: string }).error ??
      (body as { message?: string }).message ??
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body;
}

/** Daily closing */
export async function fetchDayCashSummary(
  outletId: string,
  businessDate: string
): Promise<DayCashSummary> {
  const params = new URLSearchParams({ outletId, businessDate });
  const res = await fetch(`/api/daily-closing/summary?${params}`, {
    credentials: "include",
  });
  const body = await readJson<{ summary: DayCashSummary }>(res);
  return body.summary;
}

export async function fetchUnreconciledDays(
  outletId?: string | null,
  limit = 30
): Promise<UnreconciledDayRow[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (outletId) params.set("outletId", outletId);
  const res = await fetch(`/api/daily-closing/unreconciled?${params}`, {
    credentials: "include",
  });
  const body = await readJson<{ days: UnreconciledDayRow[] }>(res);
  return body.days;
}

export async function reconcileDailyClosingApi(params: {
  outletId: string;
  businessDate: string;
  countedClosing: number;
  openingBalance?: number;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/daily-closing/reconcile", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      message:
        (body as { message?: string }).message ??
        (body as { error?: string }).error ??
        "Reconcile failed",
    };
  }
  return body as { ok: true } | { ok: false; message: string };
}

export async function buildClosingWhatsAppApi(
  outletId: string,
  businessDate: string
): Promise<
  | { ok: true; message: string; whatsappUrl: string | null }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/daily-closing/whatsapp", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outletId, businessDate }),
  });
  return res.json();
}

/** POS sale */
export async function completeSaleApi(
  payload: CompleteSaleInput
): Promise<CompleteSaleResult> {
  const res = await fetch("/api/sales/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!body.ok) {
    return {
      ok: false,
      message: (body as { message?: string }).message ?? "Sale failed",
    };
  }
  return body as CompleteSaleResult;
}

/** Purchases / GRN */
export async function receiveGoodsApi(
  payload: ReceiveGoodsInput
): Promise<{ ok: true; grnId: string } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/grn/receive", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Expenses */
export async function recordExpenseApi(
  payload: Parameters<
    typeof import("@/lib/actions/expenses").recordExpense
  >[0]
): Promise<{ ok: true; expenseId: string } | { ok: false; message: string }> {
  const res = await fetch("/api/finance/expenses", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Purchase orders */
export async function sendPurchaseOrderApi(
  poId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/purchase-orders/send", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poId }),
  });
  return res.json();
}

export async function cancelPurchaseOrderApi(
  poId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/purchase-orders/cancel", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poId }),
  });
  return res.json();
}

export async function receiveFromPurchaseOrderApi(
  payload: Parameters<
    typeof import("@/lib/actions/purchase-orders").receiveFromPurchaseOrder
  >[0]
): Promise<{ ok: true; grnId: string } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/purchase-orders/receive", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createPurchaseOrderApi(
  payload: Parameters<
    typeof import("@/lib/actions/purchase-orders").createPurchaseOrder
  >[0]
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/purchase-orders/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createManualBillApi(
  payload: Parameters<
    typeof import("@/lib/actions/payables").createManualSupplierBill
  >[0]
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/finance/payables/bill", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createSupplierApi(
  name: string
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const res = await fetch("/api/inventory/suppliers/create", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function paySupplierBillApi(
  payload: Parameters<
    typeof import("@/lib/actions/suppliers").paySupplierBill
  >[0]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch("/api/finance/payables/pay", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}
