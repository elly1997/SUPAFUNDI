import { NextResponse } from "next/server";
import { recordEmployeeBonus } from "@/lib/actions/payroll";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await recordEmployeeBonus(body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bonus failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
