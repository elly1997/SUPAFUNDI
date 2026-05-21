import { NextResponse } from "next/server";
import { listProductUnitsMap } from "@/lib/actions/product-units";
import { requireOrgContext } from "@/lib/server/org-context";
import { z } from "zod";

const bodySchema = z.object({
  productIds: z.array(z.string().uuid()).max(2000),
});

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const { productIds } = bodySchema.parse(await request.json());
    const unitsByProduct = await listProductUnitsMap(productIds);
    return NextResponse.json({ unitsByProduct });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load units";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
