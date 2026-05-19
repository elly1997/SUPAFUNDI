"use client";

import * as XLSX from "xlsx";
import {
  INVENTORY_TEMPLATE_HEADERS,
  INVENTORY_TEMPLATE_SAMPLE_ROW,
} from "./inventory-columns";

export function downloadInventoryTemplate(): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [...INVENTORY_TEMPLATE_HEADERS],
    INVENTORY_TEMPLATE_SAMPLE_ROW,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock List");
  XLSX.writeFile(wb, "General-Stock-List-template.xlsx");
}
