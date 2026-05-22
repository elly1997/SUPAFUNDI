import { NextResponse } from "next/server";
import { createSupplierRecord } from "@/lib/actions/suppliers";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      contactPerson?: string;
      openingBalance?: number;
      openingBalanceDate?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Name is required" },
        { status: 400 }
      );
    }
    const result = await createSupplierRecord({
      name: body.name.trim(),
      phone: body.phone?.trim() || undefined,
      contactPerson: body.contactPerson?.trim() || undefined,
      creditLimit: 0,
      creditDays: 30,
      openingBalance: Number(body.openingBalance) || 0,
      openingBalanceDate: body.openingBalanceDate,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
