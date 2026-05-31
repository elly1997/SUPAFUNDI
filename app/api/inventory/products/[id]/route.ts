import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { deleteProductIfZeroStock } from "@/lib/inventory/delete-product";
import { requireManagerContext } from "@/lib/server/require-manager";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { organizationId } = await requireManagerContext();
    const result = await deleteProductIfZeroStock(
      organizationId,
      context.params.id
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");
    revalidatePath("/pos");

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    const status =
      message.includes("signed in") ? 401 : message.includes("owners") ? 403 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
