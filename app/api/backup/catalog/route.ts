import { NextResponse } from "next/server";
import {
  buildCatalogBackup,
  type CatalogBackupJson,
} from "@/lib/backup/export-catalog";
import { catalogBackupToWorkbookBuffer } from "@/lib/backup/catalog-xlsx";
import { requireManagerContext } from "@/lib/server/require-manager";

export async function GET(request: Request) {
  try {
    await requireManagerContext();

    const { searchParams } = new URL(request.url);
    const outletId = searchParams.get("outletId");
    const format = searchParams.get("format") ?? "json";
    const statusParam = searchParams.get("status");
    const status =
      statusParam === "low" ||
      statusParam === "out_of_stock" ||
      statusParam === "ok"
        ? statusParam
        : undefined;

    if (!outletId) {
      return NextResponse.json(
        { error: "outletId is required" },
        { status: 400 }
      );
    }

    const backup = await buildCatalogBackup(outletId, { status });
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = backup.outletName.replace(/[^\w\-]+/g, "_").slice(0, 40);
    const statusSuffix = status ? `-${status.replaceAll("_", "-")}` : "";

    if (format === "xlsx") {
      const buffer = catalogBackupToWorkbookBuffer(
        backup.products,
        backup.outletName
      );
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="catalog-${safeName}${statusSuffix}-${stamp}.xlsx"`,
        },
      });
    }

    return NextResponse.json(backup satisfies CatalogBackupJson);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    const status = message.includes("signed in")
      ? 401
      : message.includes("owners and managers")
        ? 403
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
