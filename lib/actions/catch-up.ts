"use server";

import { eachDayOfInterval, format } from "date-fns";
import {
  computeDayCashSummary,
  getPreviousReconciledClosing,
} from "@/lib/actions/daily-closing";
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
  /** Prior reconciled day's closing — default opening float. */
  suggestedOpening: number;
  /** Live expected cash (daily-closing formula). */
  expectedCash: number;
  /** Set when day is reconciled in daily_closings. */
  reconciledClosing: number | null;
  /** open | closed | none */
  drawerStatus: "open" | "closed" | "none";
  sessionOpening: number | null;
  sessionExpected: number | null;
  sessionClosing: number | null;
  sessionVariance: number | null;
  /** Director closing report marked sent. */
  reportSent: boolean;
};

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

  const [{ data: grns }, { data: closings }, { data: sessions }] =
    await Promise.all([
    supabase
      .from("grns")
      .select("received_date, total_amount")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("received_date", fromDate)
      .lte("received_date", toDate),
    supabase
      .from("daily_closings")
      .select(
        "business_date, status, closing_balance, expected_cash, opening_balance, report_sent_at"
      )
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("business_date", fromDate)
      .lte("business_date", toDate),
    supabase
      .from("cash_sessions")
      .select(
        "business_date, status, opening_balance, expected_balance, closing_balance, variance"
      )
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .gte("business_date", fromDate)
      .lte("business_date", toDate)
      .order("opened_at", { ascending: false }),
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

  const closingByDay = new Map(
    (closings ?? []).map((c) => [c.business_date as string, c])
  );

  const sessionByDay = new Map<
    string,
    (typeof sessions extends (infer S)[] | null ? S : never)
  >();
  for (const s of sessions ?? []) {
    const d = s.business_date as string;
    if (!sessionByDay.has(d)) sessionByDay.set(d, s);
  }

  const reconciledDays = new Set(
    (closings ?? [])
      .filter((c) => c.status === "reconciled")
      .map((c) => c.business_date as string)
  );

  return Promise.all(
    days.map(async (businessDate) => {
      const grn = grnByDay.get(businessDate) ?? { count: 0, total: 0 };
      const reconciled = reconciledDays.has(businessDate);

      const summary = await computeDayCashSummary(outletId, businessDate);
      const salesCount = summary.salesCount;
      const salesTotal = summary.totalSales;
      const expectedCash = summary.expectedCash;

      let status: CatchUpDayStatus;
      if (reconciled) {
        status = "reconciled";
      } else if (grn.count > 0 && salesCount > 0) {
        status = "ready_to_reconcile";
      } else if (grn.count > 0 && salesCount === 0) {
        status = "needs_sales";
      } else if (grn.count === 0 && salesCount > 0) {
        status = "needs_purchases";
      } else {
        status = "empty";
      }

      const closing = closingByDay.get(businessDate);
      const session = sessionByDay.get(businessDate);
      const priorOpening = await getPreviousReconciledClosing(
        supabase,
        ctx.organizationId,
        outletId,
        businessDate
      );

      return {
        businessDate,
        grnCount: grn.count,
        grnTotal: grn.total,
        salesCount,
        salesTotal,
        reconciled,
        status,
        suggestedOpening: roundMoney(priorOpening),
        expectedCash,
        reconciledClosing:
          reconciled && closing?.closing_balance != null
            ? Number(closing.closing_balance)
            : null,
        drawerStatus: session
          ? (session.status as "open" | "closed")
          : "none",
        sessionOpening: session ? Number(session.opening_balance) : null,
        sessionExpected: session?.expected_balance
          ? Number(session.expected_balance)
          : null,
        sessionClosing: session?.closing_balance
          ? Number(session.closing_balance)
          : null,
        sessionVariance:
          session?.variance != null ? Number(session.variance) : null,
        reportSent: !!closing?.report_sent_at,
      };
    })
  );
}
