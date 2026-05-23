"use server";

import { eachDayOfInterval, format } from "date-fns";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseIsoDate } from "@/lib/utils/iso-date";
import { roundMoney } from "@/lib/utils/calculations";

export type CatchUpDayStatus =
  | "reconciled"
  | "ready_to_reconcile"
  | "needs_sales"
  | "needs_purchases"
  | "empty";

export type CatchUpDayRow = {
  businessDate: string;
  grnCount: number;
  grnTotal: number;
  salesCount: number;
  salesTotal: number;
  reconciled: boolean;
  status: CatchUpDayStatus;
};

function dateKey(isoOrTs: string): string {
  return isoOrTs.slice(0, 10);
}

export async function listCatchUpDays(
  outletId: string,
  fromDate: string,
  toDate: string
): Promise<CatchUpDayRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id")
    .eq("id", outletId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!outlet) throw new Error("Outlet not found.");

  const start = parseIsoDate(fromDate);
  const end = parseIsoDate(toDate);
  if (start > end) throw new Error("From date must be on or before to date.");

  const days = eachDayOfInterval({ start, end }).map((d) =>
    format(d, "yyyy-MM-dd")
  );

  const [{ data: grns }, { data: sales }, { data: closings }] = await Promise.all([
    supabase
      .from("grns")
      .select("received_date, total_amount")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("received_date", fromDate)
      .lte("received_date", toDate),
    supabase
      .from("sales")
      .select("sale_date, total_amount, status")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("sale_date", `${fromDate}T00:00:00.000Z`)
      .lte("sale_date", `${toDate}T23:59:59.999Z`),
    supabase
      .from("daily_closings")
      .select("business_date, status")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("business_date", fromDate)
      .lte("business_date", toDate),
  ]);

  const grnByDay = new Map<string, { count: number; total: number }>();
  for (const g of grns ?? []) {
    const d = String(g.received_date).slice(0, 10);
    const prev = grnByDay.get(d) ?? { count: 0, total: 0 };
    grnByDay.set(d, {
      count: prev.count + 1,
      total: roundMoney(prev.total + Number(g.total_amount)),
    });
  }

  const salesByDay = new Map<string, { count: number; total: number }>();
  for (const s of sales ?? []) {
    if (s.status === "cancelled") continue;
    const d = dateKey(String(s.sale_date));
    const prev = salesByDay.get(d) ?? { count: 0, total: 0 };
    salesByDay.set(d, {
      count: prev.count + 1,
      total: roundMoney(prev.total + Number(s.total_amount)),
    });
  }

  const reconciledDays = new Set(
    (closings ?? [])
      .filter((c) => c.status === "reconciled")
      .map((c) => c.business_date as string)
  );

  return days.map((businessDate) => {
    const grn = grnByDay.get(businessDate) ?? { count: 0, total: 0 };
    const sale = salesByDay.get(businessDate) ?? { count: 0, total: 0 };
    const reconciled = reconciledDays.has(businessDate);

    let status: CatchUpDayStatus;
    if (reconciled) {
      status = "reconciled";
    } else if (grn.count > 0 && sale.count > 0) {
      status = "ready_to_reconcile";
    } else if (grn.count > 0 && sale.count === 0) {
      status = "needs_sales";
    } else if (grn.count === 0 && sale.count > 0) {
      status = "needs_purchases";
    } else {
      status = "empty";
    }

    return {
      businessDate,
      grnCount: grn.count,
      grnTotal: grn.total,
      salesCount: sale.count,
      salesTotal: sale.total,
      reconciled,
      status,
    };
  });
}
