import { NextResponse } from "next/server";
import { loadOutletsForSettings } from "@/lib/data/settings-team";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function GET() {
  try {
    const { organizationId } = await requireManagerContext();
    const outlets = await loadOutletsForSettings(organizationId);
    return NextResponse.json({ outlets });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load outlets";
    const status = message.includes("signed in") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
