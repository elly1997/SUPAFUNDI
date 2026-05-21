import { NextResponse } from "next/server";
import {
  getProductEditDetail,
  updateProductEdit,
} from "@/lib/actions/product-units";
import { requireOrgContext } from "@/lib/server/org-context";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(200),
  categoryId: z.string().uuid().nullable(),
  units: z.array(
    z.object({
      id: z.string().uuid().optional(),
      unitLabel: z.string().min(1).max(40),
      factorToBase: z.number().positive(),
      isBase: z.boolean(),
      retailPrice: z.number().nonnegative().nullable().optional(),
      wholesalePrice: z.number().nonnegative().nullable().optional(),
      sortOrder: z.number().int().default(0),
    })
  ),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOrgContext();
    const { id } = await params;
    const detail = await getProductEditDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ product: detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load product";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireOrgContext();
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const result = await updateProductEdit({
      productId: id,
      name: body.name,
      categoryId: body.categoryId,
      units: body.units,
    });
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
