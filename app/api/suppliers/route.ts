import { NextResponse } from "next/server";
import { listSuppliers } from "@/lib/actions/suppliers";
import { requireOrgContext } from "@/lib/server/org-context";

export async function GET() {
  try {
    await requireOrgContext();
    const suppliers = await listSuppliers();
    return NextResponse.json({
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        contact_person: s.contact_person,
        payables_balance: s.payables_balance,
        is_active: s.is_active,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load suppliers";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
