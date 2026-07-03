import { NextResponse } from "next/server";
import {
  getPayrollRunDetail,
  refreshPayrollRun,
} from "@/lib/actions/payroll";
import { requireOrgContext } from "@/lib/server/org-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const month = new URL(request.url).searchParams.get("month");
    if (!month) {
      return NextResponse.json({ error: "month required" }, { status: 400 });
    }
    const run = await getPayrollRunDetail(month);
    return NextResponse.json({ run });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payroll";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const { payrollMonth } = (await request.json()) as { payrollMonth?: string };
    if (!payrollMonth) {
      return NextResponse.json({ error: "payrollMonth required" }, { status: 400 });
    }
    const result = await refreshPayrollRun(payrollMonth);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refresh failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
