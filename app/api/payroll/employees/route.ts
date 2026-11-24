import { NextResponse } from "next/server";
import {
  createEmployee,
  listEmployees,
} from "@/lib/actions/employees";
import { requireOrgContext } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") === "org" ? "org" : "outlet";
    const employees = await listEmployees(scope, params.get("outletId"));
    return NextResponse.json({ employees });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load employees";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await createEmployee(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
