import * as XLSX from "xlsx";
import {
  INVENTORY_TEMPLATE_HEADERS,
  INVENTORY_TEMPLATE_SAMPLE_ROW,
} from "@/lib/excel/inventory-columns";
import type { CatalogBackupProduct } from "@/lib/backup/export-catalog";

export function catalogBackupToWorkbookBuffer(
  products: CatalogBackupProduct[],
  outletName: string
): Buffer {
  const rows: (string | number)[][] = [
    [...INVENTORY_TEMPLATE_HEADERS],
    ...products.map((p, i) => [
      i + 1,
      p.code,
      p.name,
      p.category,
      p.quantity,
      p.cost ?? "",
      p.retailPrice ?? "",
      p.unit,
      p.notes ?? "",
    ] as (string | number)[]),
  ];
  if (rows.length === 1) {
    rows.push(INVENTORY_TEMPLATE_SAMPLE_ROW);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, outletName.slice(0, 31) || "Catalog");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
