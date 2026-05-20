import type { OutletRow, UserRow } from "@/lib/types/settings-team";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchSettingsOutlets(): Promise<OutletRow[]> {
  const res = await fetch("/api/settings/outlets", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const body = (await res.json()) as { outlets: OutletRow[] };
  return body.outlets ?? [];
}

export async function fetchSettingsUsers(): Promise<UserRow[]> {
  const res = await fetch("/api/settings/users", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const body = (await res.json()) as { users: UserRow[] };
  return body.users ?? [];
}
