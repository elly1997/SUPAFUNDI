import type { OrgOutletOption } from "@/lib/data/org-outlets";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchOrgOutlets(): Promise<OrgOutletOption[]> {
  const res = await fetch("/api/org/outlets", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const body = (await res.json()) as { outlets: OrgOutletOption[] };
  return body.outlets ?? [];
}
