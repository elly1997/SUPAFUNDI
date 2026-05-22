import { NextResponse } from "next/server";
import { buildClosingReportForWhatsApp } from "@/lib/actions/daily-closing";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      outletId?: string;
      businessDate?: string;
    };
    if (!body.outletId || !body.businessDate) {
      return NextResponse.json(
        { ok: false, message: "outletId and businessDate required" },
        { status: 400 }
      );
    }
    const result = await buildClosingReportForWhatsApp(
      body.outletId,
      body.businessDate
    );
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Report failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
