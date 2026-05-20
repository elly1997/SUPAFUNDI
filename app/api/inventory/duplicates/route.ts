import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteProductsByIds,
  findDuplicateProductGroups,
  removeAllDuplicateProducts,
} from "@/lib/inventory/duplicate-products";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function GET() {
  try {
    const { organizationId } = await requireManagerContext();
    const groups = await findDuplicateProductGroups(organizationId);
    const totalDuplicates = groups.reduce((s, g) => s + g.toRemoveCount, 0);
    return NextResponse.json({ groups, totalDuplicates });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to scan duplicates";
    const status =
      message.includes("signed in") ? 401 : message.includes("owners") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

const deleteBody = z.object({
  productIds: z.array(z.string().uuid()).optional(),
  removeAll: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const { organizationId } = await requireManagerContext();
    const body = deleteBody.parse(await request.json());

    let deleted = 0;
    let groupsProcessed = 0;
    let errors: {
      id: string;
      code: string | null;
      name: string;
      message: string;
    }[] = [];

    if (body.removeAll) {
      const result = await removeAllDuplicateProducts(organizationId);
      deleted = result.deleted;
      groupsProcessed = result.groupsProcessed;
      errors = result.errors;
    } else if (body.productIds?.length) {
      const result = await deleteProductsByIds(
        organizationId,
        body.productIds
      );
      deleted = result.deleted;
      errors = result.errors;
    } else {
      return NextResponse.json(
        { error: "Provide productIds or removeAll: true" },
        { status: 400 }
      );
    }

    revalidatePath("/inventory/products");
    revalidatePath("/inventory/stock");

    return NextResponse.json({ deleted, groupsProcessed, errors });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    const status =
      message.includes("signed in") ? 401 : message.includes("owners") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
