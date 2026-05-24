import { NextResponse } from "next/server";
import { listCategoriesForOrg } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const categories = await listCategoriesForOrg();
    return NextResponse.json({ categories });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load categories";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
