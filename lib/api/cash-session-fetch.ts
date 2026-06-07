import type {
  CashSessionRow,
  DrawerStatus,
} from "@/lib/actions/cash-sessions";

export async function fetchDrawerStatus(
  outletId: string,
  businessDate?: string
): Promise<DrawerStatus> {
  const params = new URLSearchParams({ outletId });
  if (businessDate) params.set("businessDate", businessDate);
  const res = await fetch(`/api/pos/cash-session?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const body = (await res.json()) as {
    drawer?: DrawerStatus;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load drawer status");
  }
  if (!body.drawer) {
    throw new Error("Drawer status missing");
  }
  return body.drawer;
}

/** @deprecated Use fetchDrawerStatus */
export async function fetchOpenCashSession(
  outletId: string
): Promise<CashSessionRow | null> {
  const drawer = await fetchDrawerStatus(outletId);
  return drawer.session;
}

export async function openCashSessionApi(params: {
  outletId: string;
  openingBalance?: number;
  businessDate?: string;
  notes?: string;
}): Promise<{ ok: true; sessionId: string } | { ok: false; message: string }> {
  const res = await fetch("/api/pos/cash-session/open", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    sessionId?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, message: body.error ?? body.message ?? "Open failed" };
  }
  if (body.ok && body.sessionId) {
    return { ok: true, sessionId: body.sessionId };
  }
  return { ok: false, message: body.message ?? "Open failed" };
}

export async function closeCashSessionApi(params: {
  sessionId: string;
  closingBalance: number;
  businessDate?: string;
  notes?: string;
}): Promise<
  | {
      ok: true;
      variance: number;
      expected: number;
      businessDate: string;
      needsReconcile: boolean;
    }
  | { ok: false; message: string }
> {
  const res = await fetch("/api/pos/cash-session/close", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    variance?: number;
    expected?: number;
    businessDate?: string;
    needsReconcile?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, message: body.error ?? body.message ?? "Close failed" };
  }
  if (
    body.ok &&
    body.variance != null &&
    body.expected != null &&
    body.businessDate
  ) {
    return {
      ok: true,
      variance: body.variance,
      expected: body.expected,
      businessDate: body.businessDate,
      needsReconcile: body.needsReconcile ?? true,
    };
  }
  return { ok: false, message: body.message ?? "Close failed" };
}
