import { NextResponse } from "next/server";
import type { BusinessExportType } from "@/lib/backup/business-export-types";
import { buildBusinessExportCsv } from "@/lib/backup/export-business";
import { requireManagerContext } from "@/lib/server/require-manager";

const VALID_TYPES = new Set<BusinessExportType>([
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "payments",
  "expenses",
  "journal_lines",
]);

export async function GET(request: Request) {
  try {
    await requireManagerContext();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as BusinessExportType | null;
    const fromDate = searchParams.get("fromDate") ?? undefined;
    const toDate = searchParams.get("toDate") ?? undefined;
    const outletId = searchParams.get("outletId") ?? undefined;

    if (!type || !VALID_TYPES.has(type)) {
      return NextResponse.json(
        { error: "type is required (customers, suppliers, sales, …)" },
        { status: 400 }
      );
    }

    const { csv, filename } = await buildBusinessExportCsv({
      type,
      fromDate,
      toDate,
      outletId: outletId || null,
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    const status = message.includes("signed in")
      ? 401
      : message.includes("owners and managers")
        ? 403
        : message.includes("required")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
