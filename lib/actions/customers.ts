"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

const customerInput = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  customerType: z
    .enum(["retail", "wholesale", "trade", "contractor", "vip"])
    .default("retail"),
  creditLimit: z.coerce.number().nonnegative().default(0),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
  priceType: z.enum(["retail", "wholesale", "trade", "vip"]).default("retail"),
});

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string | null;
  customer_type: string;
  credit_limit: number;
  outstanding_balance: number;
  deposit_balance: number;
  is_active: boolean;
};

export async function listCustomers(): Promise<CustomerListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, customer_type, credit_limit, outstanding_balance, deposit_balance, is_active"
    )
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    customer_type: c.customer_type,
    credit_limit: Number(c.credit_limit),
    outstanding_balance: Number(c.outstanding_balance),
    deposit_balance: Number(c.deposit_balance ?? 0),
    is_active: c.is_active,
  }));
}

const depositInput = z.object({
  customerId: z.string().uuid(),
  outletId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]),
  notes: z.string().max(500).optional(),
});

export async function recordCustomerDeposit(
  raw: z.infer<typeof depositInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = depositInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data: customer } = await supabase
      .from("customers")
      .select("deposit_balance, name")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) return { ok: false, message: "Customer not found." };

    const newBalance = roundMoney(
      Number(customer.deposit_balance ?? 0) + input.amount
    );
    const { error: updErr } = await supabase
      .from("customers")
      .update({ deposit_balance: newBalance })
      .eq("id", input.customerId);
    if (updErr) return { ok: false, message: updErr.message };

    await supabase.from("payments").insert({
      organization_id: ctx.organizationId,
      outlet_id: input.outletId,
      payment_method: input.paymentMethod,
      amount: input.amount,
      reference_no: input.notes?.trim() || `DEP-${customer.name}`,
      status: "completed",
      received_by: ctx.userId,
    });

    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
    revalidatePath("/finance/credit");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Deposit failed",
    };
  }
}

export async function createCustomer(
  raw: z.infer<typeof customerInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = customerInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        organization_id: ctx.organizationId,
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        customer_type: input.customerType,
        credit_limit: input.creditLimit,
        credit_days: input.creditDays,
        price_type: input.priceType,
        is_active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Create failed" };
    }
    revalidatePath("/customers");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create customer failed",
    };
  }
}

export async function updateCustomer(
  id: string,
  raw: z.infer<typeof customerInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = customerInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("customers")
      .update({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        customer_type: input.customerType,
        credit_limit: input.creditLimit,
        credit_days: input.creditDays,
        price_type: input.priceType,
      })
      .eq("id", id)
      .eq("organization_id", ctx.organizationId);
    if (error) {
      return { ok: false, message: error.message };
    }
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Update failed",
    };
  }
}

export type CustomerDetail = CustomerListRow & {
  email: string | null;
  address: string | null;
  credit_days: number;
  price_type: string;
  recentSales: {
    id: string;
    invoice_no: string;
    sale_date: string;
    total_amount: number;
    balance_due: number;
  }[];
};

export async function getCustomerById(
  id: string
): Promise<CustomerDetail | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: c, error } = await supabase
    .from("customers")
    .select(
      "id, name, phone, email, address, customer_type, credit_limit, credit_days, outstanding_balance, deposit_balance, price_type, is_active"
    )
    .eq("id", id)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (error || !c) return null;

  const { data: sales } = await supabase
    .from("sales")
    .select("id, invoice_no, sale_date, total_amount, balance_due")
    .eq("customer_id", id)
    .order("sale_date", { ascending: false })
    .limit(10);

  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    address: c.address,
    customer_type: c.customer_type,
    credit_limit: Number(c.credit_limit),
    credit_days: c.credit_days,
    outstanding_balance: Number(c.outstanding_balance),
    deposit_balance: Number(c.deposit_balance ?? 0),
    price_type: c.price_type,
    is_active: c.is_active,
    recentSales: (sales ?? []).map((s) => ({
      id: s.id,
      invoice_no: s.invoice_no,
      sale_date: s.sale_date,
      total_amount: Number(s.total_amount),
      balance_due: Number(s.balance_due),
    })),
  };
}
