import { NextResponse } from "next/server";
import { z } from "zod";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";
import { runInventoryImport } from "@/lib/inventory/run-import";
import { requireOrgContext } from "@/lib/server/org-context";
import { revalidatePath } from "next/cache";

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
  rows: z.array(importRowBody).min(1).max(50),
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

    const result = await runInventoryImport(
      ctx.organizationId,
      parsed.data.outletId,
      parsed.data.rows as InventoryImportRow[]
    );

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
