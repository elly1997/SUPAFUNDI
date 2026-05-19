"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

export type DashboardKpis = {
  salesToday: number;
  salesCountToday: number;
  expensesToday: number;
  netToday: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function getDashboardKpis(
  outletId?: string | null
): Promise<DashboardKpis> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const today = todayIso();

  let salesQ = supabase
    .from("sales")
    .select("total_amount")
    .eq("organization_id", ctx.organizationId)
    .eq("status", "completed")
    .gte("sale_date", today)
    .lte("sale_date", today);
  let expQ = supabase
    .from("expenses")
    .select("amount")
    .eq("organization_id", ctx.organizationId)
    .eq("expense_date", today);
  if (outletId) {
    salesQ = salesQ.eq("outlet_id", outletId);
    expQ = expQ.eq("outlet_id", outletId);
  }

  const [salesRes, expRes] = await Promise.all([salesQ, expQ]);
  if (salesRes.error) throw new Error(salesRes.error.message);
  if (expRes.error) throw new Error(expRes.error.message);

  const salesToday = roundMoney(
    (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_amount), 0)
  );
  const salesCountToday = salesRes.data?.length ?? 0;
  const expensesToday = roundMoney(
    (expRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  );

  return {
    salesToday,
    salesCountToday,
    expensesToday,
    netToday: roundMoney(salesToday - expensesToday),
  };
}
