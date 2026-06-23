import { NextResponse } from "next/server";
import { setStockQuantity } from "@/lib/actions/stock";
import { z } from "zod";

const bodySchema = z.object({
  productId: z.string().uuid(),
  outletId: z.string().uuid(),
  quantity: z.number().nonnegative(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const result = await setStockQuantity(
      body.productId,
      body.outletId,
      body.quantity,
      body.reason
    );
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
