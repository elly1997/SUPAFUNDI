import { NextResponse } from "next/server";
import {
  createEmployee,
  listEmployees,
} from "@/lib/actions/employees";
import { requireOrgContext } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireOrgContext();
    const employees = await listEmployees();
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
