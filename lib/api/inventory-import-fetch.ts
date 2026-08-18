import type { InventoryImportRow } from "@/lib/excel/parse-inventory";
import type {
  InventoryImportMode,
  InventoryImportPreview,
  ImportInventoryResult,
} from "@/lib/inventory/run-import";

const CHUNK_SIZE = 40;

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function postInventoryImportChunk(
  outletId: string,
  rows: InventoryImportRow[],
  mode: InventoryImportMode
): Promise<ImportInventoryResult> {
  const res = await fetch("/api/inventory/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ outletId, mode, rows }),
  });
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const body = (await res.json()) as ImportInventoryResult;
  if (
    typeof body?.imported !== "number" ||
    typeof body?.updated !== "number" ||
    !Array.isArray(body?.errors)
  ) {
    throw new Error("Invalid import response from server.");
  }
  return body;
}

/** Import large spreadsheets in chunks to avoid server timeouts. */
export async function importInventoryInChunks(
  outletId: string,
  rows: InventoryImportRow[],
  mode: InventoryImportMode,
  onProgress?: (done: number, total: number) => void
): Promise<ImportInventoryResult> {
  const total = rows.length;
  const aggregated: ImportInventoryResult = {
    imported: 0,
    updated: 0,
    errors: [],
  };

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const res = await postInventoryImportChunk(outletId, chunk, mode);
    aggregated.imported += res.imported;
    aggregated.updated += res.updated;
    aggregated.errors.push(...res.errors);
    onProgress?.(Math.min(i + chunk.length, total), total);
  }

  return aggregated;
}

export async function previewInventoryImportApi(
  outletId: string,
  rows: InventoryImportRow[],
  mode: InventoryImportMode
): Promise<InventoryImportPreview> {
  const res = await fetch("/api/inventory/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ outletId, rows, mode }),
  });
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  return res.json() as Promise<InventoryImportPreview>;
}
