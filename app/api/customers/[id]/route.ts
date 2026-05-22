import { NextResponse } from "next/server";
import {
  deleteCustomer,
  getCustomerById,
  updateCustomer,
} from "@/lib/actions/customers";
import { requireOrgContext } from "@/lib/server/org-context";

type Params = { params: Promise<{ id: string }> };

function authStatus(message: string): number {
  if (message.includes("signed in")) return 401;
  if (message.includes("owners and managers")) return 403;
  return 500;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    await requireOrgContext();
    const { id } = await params;
    const customer = await getCustomerById(id);
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ customer });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to load customer";
    return NextResponse.json({ error: message }, { status: authStatus(message) });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      customerType?: "retail" | "wholesale" | "trade" | "contractor" | "vip";
      creditLimit?: number;
      creditDays?: number;
      priceType?: "retail" | "wholesale" | "trade" | "vip";
    };
    if (!body.name?.trim()) {
      return NextResponse.json(
        { ok: false, message: "Name is required" },
        { status: 400 }
      );
    }
    const result = await updateCustomer(id, {
      name: body.name.trim(),
      phone: body.phone?.trim() || undefined,
      email: body.email?.trim() || undefined,
      address: body.address?.trim() || undefined,
      customerType: body.customerType,
      creditLimit:
        body.creditLimit !== undefined ? Number(body.creditLimit) : undefined,
      creditDays:
        body.creditDays !== undefined ? Number(body.creditDays) : undefined,
      priceType: body.priceType,
    });
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.message.includes("not found") ? 404 : 400,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ ok: false, message }, { status: authStatus(message) });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const result = await deleteCustomer(id);
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.message.includes("not found") ? 404 : 400,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ ok: false, message }, { status: authStatus(message) });
  }
}
