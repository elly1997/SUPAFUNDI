import { NextResponse } from "next/server";
import {
  listProductPriceCatalog,
  patchProductCatalogField,
} from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const outletId = new URL(request.url).searchParams.get("outletId");
    const rows = await listProductPriceCatalog(outletId);
    return NextResponse.json({ products: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load catalogue";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

const patchSchema = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid().optional(),
  field: z.enum(["code", "unit", "costPrice", "retailPrice"]),
  value: z.union([z.string(), z.number()]),
});

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());
    const result = await patchProductCatalogField(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    const status = message.includes("signed in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
