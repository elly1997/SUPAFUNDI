import type { CashSessionRow } from "@/lib/actions/cash-sessions";

export async function fetchOpenCashSession(
  outletId: string
): Promise<CashSessionRow | null> {
  const res = await fetch(
    `/api/pos/cash-session?outletId=${encodeURIComponent(outletId)}`,
    { credentials: "include" }
  );
  const body = (await res.json()) as {
    session?: CashSessionRow | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load cash session");
  }
  return body.session ?? null;
}

export async function openCashSessionApi(params: {
  outletId: string;
  openingBalance: number;
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
  notes?: string;
}): Promise<{ ok: true; variance: number } | { ok: false; message: string }> {
  const res = await fetch("/api/pos/cash-session/close", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    variance?: number;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, message: body.error ?? body.message ?? "Close failed" };
  }
  if (body.ok && body.variance != null) {
    return { ok: true, variance: body.variance };
  }
  return { ok: false, message: body.message ?? "Close failed" };
}
