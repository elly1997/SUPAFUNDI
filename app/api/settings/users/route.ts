import { NextResponse } from "next/server";
import { loadUsersForSettings } from "@/lib/data/settings-team";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function GET() {
  try {
    const { organizationId } = await requireManagerContext();
    const users = await loadUsersForSettings(organizationId);
    return NextResponse.json({ users });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load team";
    const status = message.includes("signed in") ? 401 : 403;
    return NextResponse.json({ error: message }, { status });
  }
}
