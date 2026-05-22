import { NextResponse } from "next/server";
import { createCustomer } from "@/lib/actions/customers";
import { requireOrgContext } from "@/lib/server/org-context";

export async function POST(request: Request) {
  try {
    await requireOrgContext();
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { ok: false, message: "Name is required" },
        { status: 400 }
      );
    }
    const result = await createCustomer({
      name: body.name.trim(),
      phone: typeof body.phone === "string" ? body.phone : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
      customerType:
        (body.customerType as
          | "retail"
          | "wholesale"
          | "trade"
          | "contractor"
          | "vip") ?? "retail",
      creditLimit: Number(body.creditLimit) || 0,
      creditDays: Number(body.creditDays) ?? 30,
      priceType:
        (body.priceType as "retail" | "wholesale" | "trade" | "vip") ??
        "retail",
      openingCredit: Number(body.openingCredit) || 0,
      openingDeposit: Number(body.openingDeposit) || 0,
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
