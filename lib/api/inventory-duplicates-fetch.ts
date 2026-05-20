import type { DuplicateProductGroup } from "@/lib/types/duplicate-products";

async function parseError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* not JSON */
  }
  const trimmed = text.trim();
  if (trimmed) return trimmed.slice(0, 240);
  const status = `${res.status} ${res.statusText}`.trim();
  return status || "Request failed";
}

const DELETE_CHUNK = 100;

export async function deleteDuplicateProducts(params: {
  productIds?: string[];
  removeAll?: boolean;
}): Promise<{
  deleted: number;
  groupsProcessed: number;
  errors: { id: string; code: string | null; name: string; message: string }[];
}> {
  if (params.removeAll) {
    const scan = await fetchDuplicateProducts();
    const ids = scan.groups.flatMap((g) =>
      g.entries.filter((e) => !e.keepRecommended).map((e) => e.id)
    );
    return deleteDuplicateProductsInChunks(ids);
  }
  if (params.productIds?.length) {
    return deleteDuplicateProductsInChunks(params.productIds);
  }
  throw new Error("Provide productIds or removeAll: true");
}

async function deleteDuplicateProductsInChunks(
  productIds: string[]
): Promise<{
  deleted: number;
  groupsProcessed: number;
  errors: { id: string; code: string | null; name: string; message: string }[];
}> {
  const unique = Array.from(new Set(productIds));
  if (unique.length === 0) {
    return { deleted: 0, groupsProcessed: 0, errors: [] };
  }

  let deleted = 0;
  const errors: {
    id: string;
    code: string | null;
    name: string;
    message: string;
  }[] = [];

  for (let i = 0; i < unique.length; i += DELETE_CHUNK) {
    const chunk = unique.slice(i, i + DELETE_CHUNK);
    const res = await fetch("/api/inventory/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productIds: chunk }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    const body = (await res.json()) as {
      deleted: number;
      errors: { id: string; code: string | null; name: string; message: string }[];
    };
    deleted += body.deleted ?? 0;
    errors.push(...(body.errors ?? []));
  }

  return { deleted, groupsProcessed: 0, errors };
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

