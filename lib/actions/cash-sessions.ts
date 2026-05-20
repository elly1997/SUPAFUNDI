"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

export type CashSessionRow = {
  id: string;
  outlet_id: string | null;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  variance: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

export async function listCashSessionHistory(
  outletId?: string | null,
  limit = 30
): Promise<CashSessionRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("cash_sessions")
    .select(
      "id, outlet_id, opening_balance, closing_balance, expected_balance, variance, status, opened_at, closed_at"
    )
    .eq("organization_id", ctx.organizationId)
    .order("opened_at", { ascending: false })
    .limit(limit);
  const filterOutlet = outletId ?? ctx.outletId;
  if (filterOutlet) q = q.eq("outlet_id", filterOutlet);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    outlet_id: row.outlet_id,
    opening_balance: Number(row.opening_balance),
    closing_balance: row.closing_balance ? Number(row.closing_balance) : null,
    expected_balance: row.expected_balance
      ? Number(row.expected_balance)
      : null,
    variance: row.variance ? Number(row.variance) : null,
    status: row.status,
    opened_at: row.opened_at,
    closed_at: row.closed_at,
  }));
}

export async function getOpenCashSession(
  outletId: string
): Promise<CashSessionRow | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select(
      "id, outlet_id, opening_balance, closing_balance, expected_balance, variance, status, opened_at, closed_at"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    outlet_id: data.outlet_id,
    opening_balance: Number(data.opening_balance),
    closing_balance: data.closing_balance ? Number(data.closing_balance) : null,
    expected_balance: data.expected_balance
      ? Number(data.expected_balance)
      : null,
    variance: data.variance ? Number(data.variance) : null,
    status: data.status,
    opened_at: data.opened_at,
    closed_at: data.closed_at,
  };
}

const openSessionInput = z.object({
  outletId: z.string().uuid(),
  openingBalance: z.coerce.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

export async function openCashSession(
  raw: z.infer<typeof openSessionInput>
): Promise<{ ok: true; sessionId: string } | { ok: false; message: string }> {
  try {
    const input = openSessionInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const existing = await getOpenCashSession(input.outletId);
    if (existing) {
      return { ok: false, message: "A cash session is already open for this outlet." };
    }

    const { data, error } = await supabase
      .from("cash_sessions")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        cashier_id: ctx.userId,
        opening_balance: input.openingBalance,
        status: "open",
        notes: input.notes?.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Open session failed" };
    }
    revalidatePath("/pos");
    revalidatePath("/finance/cash-sessions");
    return { ok: true, sessionId: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Open session failed",
    };
  }
}

const closeSessionInput = z.object({
  sessionId: z.string().uuid(),
  closingBalance: z.coerce.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

export async function closeCashSession(
  raw: z.infer<typeof closeSessionInput>
): Promise<{ ok: true; variance: number } | { ok: false; message: string }> {
  try {
    const input = closeSessionInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: session } = await supabase
      .from("cash_sessions")
      .select("id, outlet_id, opening_balance, opened_at, status")
      .eq("id", input.sessionId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!session || session.status !== "open") {
      return { ok: false, message: "Session not found or already closed." };
    }

    let cashQuery = supabase
      .from("payments")
      .select("amount")
      .eq("organization_id", ctx.organizationId)
      .eq("payment_method", "cash")
      .eq("status", "completed")
      .gte("payment_date", session.opened_at);
    if (session.outlet_id) {
      cashQuery = cashQuery.eq("outlet_id", session.outlet_id);
    }
    const { data: cashPayments } = await cashQuery;
    const cashSales = roundMoney(
      (cashPayments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    );
    const expected = roundMoney(
      Number(session.opening_balance) + cashSales
    );
    const variance = roundMoney(input.closingBalance - expected);

    const { error } = await supabase
      .from("cash_sessions")
      .update({
        closing_balance: input.closingBalance,
        expected_balance: expected,
        variance,
        status: "closed",
        closed_at: new Date().toISOString(),
        notes: input.notes?.trim() || null,
      })
      .eq("id", input.sessionId);
    if (error) {
      return { ok: false, message: error.message };
    }
    revalidatePath("/pos");
    revalidatePath("/finance/cash-sessions");
    return { ok: true, variance };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Close session failed",
    };
  }
}
