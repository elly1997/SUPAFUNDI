import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { applyMissingRetailPrices } from "@/lib/actions/inventory";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function POST(request: Request) {
  try {
    await requireManagerContext();
    let outletId: string | null = null;
    try {
      const body = (await request.json()) as { outletId?: string };
      if (body.outletId) outletId = body.outletId;
    } catch {
      /* empty body ok */
    }
    const result = await applyMissingRetailPrices(outletId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    revalidatePath("/reports");
    revalidatePath("/pos");

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    const status = message.includes("signed in")
      ? 401
      : message.includes("owners")
        ? 403
        : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
