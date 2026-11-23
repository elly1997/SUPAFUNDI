import { NextResponse } from "next/server";
import { z } from "zod";
import {
  applyProductCategorySuggestions,
  ensureHardwareProductCategories,
  scanProductCategoryCleanup,
} from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const { searchParams } = new URL(request.url);
    const outletId = searchParams.get("outletId");
    if (!outletId) {
      return NextResponse.json(
        { error: "outletId is required" },
        { status: 400 }
      );
    }
    const scan = await scanProductCategoryCleanup(outletId);
    return NextResponse.json(scan);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cleanup scan failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = await request.json();
    const action = z
      .enum(["ensure", "apply"])
      .parse(body?.action ?? "apply");

    if (action === "ensure") {
      const result = await ensureHardwareProductCategories();
      return NextResponse.json(result);
    }

    const parsed = z
      .object({
        outletId: z.string().uuid(),
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
              suggestedName: z.string().min(1).max(200),
            })
          )
          .min(1)
          .max(500),
      })
      .parse(body);

    const result = await applyProductCategorySuggestions(parsed);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Category cleanup failed";
    const status = message.includes("signed in") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
