import { NextResponse } from "next/server";
import {
  listProductPriceCatalog,
  listProductPriceCatalogPage,
  patchProductCatalogField,
} from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";
import { z } from "zod";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const outletId = params.get("outletId");
    const page = params.get("page");
    const pageSize = params.get("pageSize");
    const search = params.get("search") ?? "";
    const categoryId = params.get("categoryId");
    if (page || pageSize || search || categoryId) {
      const result = await listProductPriceCatalogPage({
        outletId,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        search,
        categoryId,
      });
      return NextResponse.json(result);
    }

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
  reason: z.string().max(500).optional(),
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
