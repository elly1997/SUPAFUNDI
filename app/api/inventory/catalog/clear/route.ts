import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { clearAllProducts } from "@/lib/inventory/clear-catalog";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function POST() {
  try {
    const { organizationId } = await requireManagerContext();
    const result = await clearAllProducts(organizationId);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");

    return NextResponse.json({ deleted: result.deleted });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Clear failed";
    const status =
      message.includes("signed in") ? 401 : message.includes("owners") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
