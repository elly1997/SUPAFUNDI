import { NextResponse } from "next/server";
import { z } from "zod";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";
import {
  previewInventoryImport,
  type InventoryImportMode,
} from "@/lib/inventory/run-import";
import { requireOrgContext } from "@/lib/server/org-context";

const importRowBody = z.object({
  code: z.string().optional(),
  name: z.string(),
  category: z.string(),
  quantity: z.number(),
  cost: z.number().optional(),
  retailPrice: z.number().optional(),
  unit: z.string(),
  notes: z.string().optional(),
});

const bodySchema = z.object({
  outletId: z.string().uuid(),
  mode: z.enum(["catalog_and_stock", "catalog_only", "stock_only"]),
  rows: z.array(importRowBody).min(1).max(1000),
});

export async function POST(request: Request) {
  try {
    const ctx = await requireOrgContext();
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    const result = await previewInventoryImport(
      ctx.organizationId,
      parsed.data.outletId,
      parsed.data.rows as InventoryImportRow[],
      parsed.data.mode as InventoryImportMode
    );

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Preview failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
