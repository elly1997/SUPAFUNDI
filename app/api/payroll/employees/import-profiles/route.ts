import { NextResponse } from "next/server";
import { importEmployeesFromProfiles } from "@/lib/actions/employees";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await importEmployeesFromProfiles();
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
