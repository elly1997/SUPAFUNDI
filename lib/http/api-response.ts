import { NextResponse } from "next/server";

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export type ApiErrorBody = {
  ok: false;
  error: string;
  requestId: string;
};

export function jsonNotImplemented(
  message: string,
  status = 501
): NextResponse<ApiErrorBody> {
  const requestId = newRequestId();
  return NextResponse.json(
    { ok: false, error: message, requestId },
    {
      status,
      headers: {
        "X-Request-Id": requestId,
        "Cache-Control": "no-store",
      },
    }
  );
}

export function methodNotAllowed(
  allowed: string
): NextResponse<ApiErrorBody> {
  const requestId = newRequestId();
  return NextResponse.json(
    { ok: false, error: "Method not allowed", requestId },
    {
      status: 405,
      headers: {
        Allow: allowed,
        "X-Request-Id": requestId,
        "Cache-Control": "no-store",
      },
    }
  );
}
