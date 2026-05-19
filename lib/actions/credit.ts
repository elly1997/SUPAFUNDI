"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildCustomerPaymentJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

export type CustomerBalanceRow = {
  id: string;
  name: string;
  phone: string | null;
  outstanding_balance: number;
  credit_limit: number;
};

export async function listCustomersWithBalance(): Promise<CustomerBalanceRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, name, phone, outstanding_balance, credit_limit")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .gt("outstanding_balance", 0)
    .order("outstanding_balance", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding_balance: Number(c.outstanding_balance),
    credit_limit: Number(c.credit_limit),
  }));
}

const paymentInput = z.object({
  customerId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]).default("cash"),
  referenceNo: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export async function recordCustomerPayment(
  raw: z.infer<typeof paymentInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = paymentInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, outstanding_balance")
      .eq("id", input.customerId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!customer) {
      return { ok: false, message: "Customer not found." };
    }
    const owed = Number(customer.outstanding_balance);
    if (input.amount > owed) {
      return {
        ok: false,
        message: `Payment exceeds balance (${owed}).`,
      };
    }

    const newBalance = roundMoney(owed - input.amount);
    const { data: ledger, error: ledgerErr } = await supabase
      .from("credit_ledger")
      .insert({
        organization_id: ctx.organizationId,
        customer_id: input.customerId,
        entry_type: "payment",
        reference_type: "customer_payment",
        debit: 0,
        credit: input.amount,
        balance: newBalance,
        description:
          input.notes?.trim() ||
          `Payment received — ${input.referenceNo ?? input.paymentMethod}`,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (ledgerErr || !ledger) {
      return { ok: false, message: ledgerErr?.message ?? "Ledger insert failed" };
    }

    const { error: custErr } = await supabase
      .from("customers")
      .update({ outstanding_balance: newBalance })
      .eq("id", input.customerId);
    if (custErr) {
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: custErr.message };
    }

    const { error: payErr } = await supabase.from("payments").insert({
      organization_id: ctx.organizationId,
      outlet_id: ctx.outletId,
      payment_method: input.paymentMethod,
      amount: input.amount,
      reference_no: input.referenceNo?.trim() || null,
      status: "completed",
      received_by: ctx.userId,
    });
    if (payErr) {
      await supabase
        .from("customers")
        .update({ outstanding_balance: owed })
        .eq("id", input.customerId);
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: payErr.message };
    }

    const journal = await postJournalEntry({
      description: `Customer payment — ${customer.name}`,
      sourceType: "payment",
      sourceId: ledger.id,
      outletId: ctx.outletId ?? undefined,
      lines: buildCustomerPaymentJournalLines(
        input.amount,
        input.paymentMethod
      ),
    });
    if (!journal.ok) {
      await supabase
        .from("customers")
        .update({ outstanding_balance: owed })
        .eq("id", input.customerId);
      await supabase.from("credit_ledger").delete().eq("id", ledger.id);
      return { ok: false, message: journal.message };
    }

    revalidatePath("/finance/credit");
    revalidatePath("/customers");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Payment failed",
    };
  }
}
