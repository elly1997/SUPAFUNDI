import { NextResponse } from "next/server";
import { getOrganizationSettings } from "@/lib/actions/settings";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const settings = await getOrganizationSettings();
    if (!settings) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    }
    return NextResponse.json({
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load settings";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
