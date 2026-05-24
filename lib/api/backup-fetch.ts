import type { CatalogBackupJson } from "@/lib/backup/export-catalog";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function downloadCatalogJson(
  outletId: string
): Promise<CatalogBackupJson> {
  const params = new URLSearchParams({ outletId, format: "json" });
  const res = await fetch(`/api/backup/catalog?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CatalogBackupJson>;
}

export async function downloadCatalogXlsx(
  outletId: string,
  outletName: string
): Promise<void> {
  const params = new URLSearchParams({ outletId, format: "xlsx" });
  const res = await fetch(`/api/backup/catalog?${params}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = outletName.replace(/[^\w\-]+/g, "_").slice(0, 40);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `catalog-${safeName}-${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function catalogJsonToImportRows(
  backup: CatalogBackupJson
): InventoryImportRow[] {
  return backup.products.map((p) => ({
    code: p.code,
    name: p.name,
    category: p.category,
    quantity: p.quantity,
    cost: p.cost,
    retailPrice: p.retailPrice,
    unit: p.unit,
    notes: p.notes,
  }));
}
