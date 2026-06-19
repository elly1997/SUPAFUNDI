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

function readSum(
  data: Record<string, unknown> | null | undefined,
  field: string
): number {
  if (!data) return 0;
  const nested = data[field];
  if (typeof nested === "number") return nested;
  if (
    nested &&
    typeof nested === "object" &&
    "sum" in nested &&
    typeof (nested as { sum?: unknown }).sum === "number"
  ) {
    return (nested as { sum: number }).sum;
  }
  const flat = data[`${field}.sum`];
  return typeof flat === "number" ? flat : 0;
}

export async function getDashboardKpis(
  outletId?: string | null,
  businessDate?: string | null
): Promise<DashboardKpis> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const date = resolveBusinessDate(businessDate);
  const bounds = businessDayBounds(date);

  const [salesSumRes, salesCountRes, expSumRes] = await Promise.all([
    applySalesFilters(
      supabase.from("sales").select("total_amount.sum()"),
      ctx.organizationId,
      bounds,
      outletId
    ).maybeSingle(),
    applySalesFilters(
      supabase.from("sales").select("*", { count: "exact", head: true }),
      ctx.organizationId,
      bounds,
      outletId
    ),
    applyExpenseFilters(
      supabase.from("expenses").select("amount.sum()"),
      ctx.organizationId,
      date,
      outletId
    ).maybeSingle(),
  ]);

  if (salesSumRes.error) throw new Error(salesSumRes.error.message);
  if (salesCountRes.error) throw new Error(salesCountRes.error.message);
  if (expSumRes.error) throw new Error(expSumRes.error.message);

  const salesToday = roundMoney(
    readSum(salesSumRes.data as Record<string, unknown> | null, "total_amount")
  );
  const salesCountToday = salesCountRes.count ?? 0;
  const expensesToday = roundMoney(
    readSum(expSumRes.data as Record<string, unknown> | null, "amount")
  );

  return {
    salesToday,
    salesCountToday,
    expensesToday,
    netToday: roundMoney(salesToday - expensesToday),
  };
}
