import { NextResponse } from "next/server";
import { voidGrn } from "@/lib/actions/grn";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { grnId?: string };
    if (!body.grnId) {
      return NextResponse.json(
        { ok: false, message: "grnId is required" },
        { status: 400 }
      );
    }
    const result = await voidGrn(body.grnId);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Void failed";
    const status =
      message.includes("signed in") || message.includes("permission")
        ? 401
        : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
