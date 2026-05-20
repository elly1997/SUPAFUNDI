import type { DuplicateProductGroup } from "@/lib/types/duplicate-products";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchDuplicateProducts(): Promise<{
  groups: DuplicateProductGroup[];
  totalDuplicates: number;
}> {
  const res = await fetch("/api/inventory/duplicates", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    groups: DuplicateProductGroup[];
    totalDuplicates: number;
  }>;
}

export async function deleteDuplicateProducts(params: {
  productIds?: string[];
  removeAll?: boolean;
}): Promise<{
  deleted: number;
  groupsProcessed: number;
  errors: { id: string; code: string | null; name: string; message: string }[];
}> {
  const res = await fetch("/api/inventory/duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    deleted: number;
    groupsProcessed: number;
    errors: { id: string; code: string | null; name: string; message: string }[];
  }>;
}
