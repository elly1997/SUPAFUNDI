"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { businessDayBounds, resolveBusinessDate } from "@/lib/utils/iso-date";

export type DashboardKpis = {
  salesToday: number;
  salesCountToday: number;
  expensesToday: number;
  netToday: number;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function applySalesFilters(
  q: ReturnType<Supabase["from"]>,
  organizationId: string,
  bounds: { from: string; to: string },
  outletId?: string | null
) {
  let filtered = q
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("sale_date", bounds.from)
    .lte("sale_date", bounds.to);
  if (outletId) filtered = filtered.eq("outlet_id", outletId);
  return filtered;
}

function applyExpenseFilters(
  q: ReturnType<Supabase["from"]>,
  organizationId: string,
  date: string,
  outletId?: string | null
) {
  let filtered = q
    .eq("organization_id", organizationId)
    .eq("expense_date", date);
  if (outletId) filtered = filtered.eq("outlet_id", outletId);
  return filtered;
}

export async function getDashboardKpis(
  outletId?: string | null,
  businessDate?: string | null
): Promise<DashboardKpis> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const date = resolveBusinessDate(businessDate);
  const bounds = businessDayBounds(date);

  const [salesRes, expRes] = await Promise.all([
    applySalesFilters(
      supabase.from("sales").select("total_amount"),
      ctx.organizationId,
      bounds,
      outletId
    ),
    applyExpenseFilters(
      supabase.from("expenses").select("amount"),
      ctx.organizationId,
      date,
      outletId
    ),
  ]);

  if (salesRes.error) throw new Error(salesRes.error.message);
  if (expRes.error) throw new Error(expRes.error.message);

  const salesRows = (salesRes.data ?? []) as { total_amount: number }[];
  const salesToday = roundMoney(
    salesRows.reduce((sum: number, row) => sum + Number(row.total_amount), 0)
  );
  const salesCountToday = salesRows.length;
  const expensesToday = roundMoney(
    ((expRes.data ?? []) as { amount: number }[]).reduce(
      (sum: number, row) => sum + Number(row.amount),
      0
    )
  );

  return {
    salesToday,
    salesCountToday,
    expensesToday,
    netToday: roundMoney(salesToday - expensesToday),
  };
}
