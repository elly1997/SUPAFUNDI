import { headers } from "next/headers";

function normalizeOrigin(value: string | undefined | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (!url.hostname) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function originFromEnv(): string | null {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.URL) ??
    normalizeOrigin(process.env.DEPLOY_PRIME_URL) ??
    null
  );
}

/** Public origin for auth emails. Prefers the host the owner is currently on. */
export async function getAppOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? "https";
    const fromRequest = normalizeOrigin(host ? `${proto}://${host}` : null);
    if (fromRequest && !fromRequest.includes("localhost")) {
      return fromRequest;
    }
    if (fromRequest) {
      return fromRequest;
    }
  } catch {
    /* no request scope */
  }

  return originFromEnv() ?? "http://localhost:3000";
}

export function inviteRedirectPath(): string {
  return "/auth/callback?next=/set-password";
}

export async function getInviteRedirectUrl(): Promise<string> {
  const origin = await getAppOrigin();
  return `${origin}${inviteRedirectPath()}`;
}
