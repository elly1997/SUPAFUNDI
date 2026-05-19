import { z } from "zod";

import * as XLSX from "xlsx";

import { generateProductCode } from "@/lib/products/sku";



const DEFAULT_CATEGORY = "General";

const DEFAULT_UNIT = "pcs";



/** Empty / missing → undefined; valid number → value; invalid → undefined. */

function optionalNonNegativeNumber() {

  return z.preprocess((v) => {

    if (v === "" || v === null || v === undefined) return undefined;

    const n = Number(String(v).replace(/,/g, "").trim());

    return Number.isFinite(n) && n >= 0 ? n : undefined;

  }, z.number().nonnegative().optional());

}



/** Accepts plain numbers and tallies like `22+`, `10+5`. */

export function parseQuantityCell(v: unknown): number {

  const s = String(v ?? "").trim();

  if (!s) return 0;

  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);

  if (s.includes("+")) {

    const parts = s.split("+").map((p) => p.replace(/[^\d.]/g, "").trim());

    const sum = parts.reduce((acc, p) => {

      if (!p) return acc;

      const n = Number(p);

      return acc + (Number.isFinite(n) ? n : 0);

    }, 0);

    if (sum > 0) return sum;

  }

  const n = Number(s.replace(/,/g, ""));

  return Number.isFinite(n) && n >= 0 ? n : 0;

}



function requiredQuantity() {

  return z.preprocess((v) => parseQuantityCell(v), z.number().nonnegative());

}



export const inventoryImportRowSchema = z.object({

  code: z.string().optional(),

  name: z.string().min(1, "Name required"),

  category: z.preprocess(

    (v) => {

      const s = String(v ?? "").trim();

      return s || DEFAULT_CATEGORY;

    },

    z.string().min(1)

  ),

  quantity: requiredQuantity(),

  cost: optionalNonNegativeNumber(),

  retailPrice: optionalNonNegativeNumber(),

  unit: z.preprocess((v) => {

    const s = String(v ?? "").trim();

    return s || DEFAULT_UNIT;

  }, z.string().min(1)),

  notes: z.string().optional(),

});



export type InventoryImportRow = z.infer<typeof inventoryImportRowSchema>;



function normalizeHeader(cell: unknown): string {

  return String(cell ?? "")

    .trim()

    .toLowerCase()

    .replace(/\s+/g, " ");

}



function mapHeaderToKey(h: unknown): keyof InventoryImportRow | "page" | null {

  const n = normalizeHeader(h);

  if (n === "page" || n === "pg" || n === "sheet") return "page";

  if (n === "code" || n === "sku" || n === "item code") return "code";

  if (n === "name" || n === "product" || n === "product name" || n === "item")

    return "name";

  if (n === "category" || n === "cat" || n === "group") return "category";

  if (n === "quantity" || n === "qty" || n === "stock" || n === "qnty")

    return "quantity";

  if (n === "cost" || n === "unit cost" || n === "cost price") return "cost";

  if (

    n === "retail price" ||

    n === "retail" ||

    n === "selling price" ||

    n === "price"

  )

    return "retailPrice";

  if (n === "unit" || n === "uom" || n === "units") return "unit";

  if (n === "notes" || n === "note" || n === "remarks" || n === "comment")

    return "notes";

  return null;

}



function rowObject(

  headers: (keyof InventoryImportRow | "page" | null)[],

  row: unknown[]

): Record<string, unknown> {

  const o: Record<string, unknown> = {};

  headers.forEach((key, i) => {

    if (!key || key === "page") return;

    const v = row[i];

    o[key] = v === undefined || v === null ? "" : v;

  });

  return o;

}



/**

 * Merge rows that share the same explicit Code (case-insensitive): quantities add;

 * last non-empty cost/retail wins; name, category, unit, notes from last row.

 */

function mergeDuplicateCodes(rows: InventoryImportRow[]): InventoryImportRow[] {

  const map = new Map<string, InventoryImportRow>();

  let emptyIdx = 0;

  for (const r of rows) {

    const trimmed = r.code?.trim();

    if (!trimmed) {

      map.set(`__empty_${emptyIdx++}`, { ...r, code: undefined });

      continue;

    }

    const key = trimmed.toUpperCase();

    const existing = map.get(key);

    if (!existing) {

      map.set(key, { ...r, code: trimmed });

      continue;

    }

    map.set(key, {

      code: trimmed,

      name: r.name,

      category: r.category,

      quantity: existing.quantity + r.quantity,

      cost: r.cost ?? existing.cost,

      retailPrice: r.retailPrice ?? existing.retailPrice,

      unit: r.unit,

      notes: r.notes ?? existing.notes,

    });

  }

  return Array.from(map.values());

}



export type ParseInventoryResult =

  | { ok: true; rows: InventoryImportRow[] }

  | { ok: false; error: string };



export function parseInventoryWorkbook(buffer: ArrayBuffer): ParseInventoryResult {

  let wb: XLSX.WorkBook;

  try {

    wb = XLSX.read(buffer, { type: "array", cellDates: true });

  } catch {

    return { ok: false, error: "Could not read spreadsheet file." };

  }

  const sheet = wb.Sheets[wb.SheetNames[0]];

  if (!sheet) {

    return { ok: false, error: "No worksheet found in file." };

  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {

    header: 1,

    defval: "",

    raw: false,

  });

  if (!aoa.length) {

    return { ok: false, error: "Sheet is empty." };

  }

  const headerRow = aoa[0] as unknown[];

  const keys = headerRow.map((h) => mapHeaderToKey(h));

  if (!keys.some((k) => k && k !== "page")) {

    return {

      ok: false,

      error:

        "No recognized columns. Expected: Code, Name, Category, Quantity, Cost, Retail Price, Unit (Page and Notes optional).",

    };

  }

  const parsed: InventoryImportRow[] = [];

  for (let i = 1; i < aoa.length; i++) {

    const cells = aoa[i] as unknown[];

    if (!cells || !cells.some((c) => String(c).trim() !== "")) continue;

    const obj = rowObject(keys, cells);

    const r = inventoryImportRowSchema.safeParse(obj);

    if (!r.success) {

      return {

        ok: false,

        error: `Row ${i + 1}: ${r.error.issues.map((x) => x.message).join(", ")}`,

      };

    }

    parsed.push(r.data);

  }

  if (!parsed.length) {

    return { ok: false, error: "No data rows found below the header." };

  }

  const merged = mergeDuplicateCodes(parsed);

  const withCodes = merged.map((row) => ({

    ...row,

    code: row.code?.trim() || generateProductCode(),

  }));

  return { ok: true, rows: withCodes };

}


