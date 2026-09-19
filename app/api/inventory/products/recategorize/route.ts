import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkRecategorizeProducts } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";

const bodySchema = z.object({
  outletId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(200),
  categoryId: z.string().uuid().nullable().optional(),
  categoryName: z.string().min(1).max(200).optional(),
});

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = bodySchema.parse(await request.json());
    const result = await bulkRecategorizeProducts(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, updated: result.updated });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not update categories";
    const status = message.includes("signed in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
