import { NextResponse } from "next/server";
import {
  loadOrgOutlets,
  outletsForOperations,
} from "@/lib/data/org-outlets";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const all = await loadOrgOutlets(ctx.organizationId);
    const outlets = outletsForOperations(all);
    return NextResponse.json({ outlets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load outlets";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
