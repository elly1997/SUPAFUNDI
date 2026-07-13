"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addDaysIso } from "@/lib/utils/iso-date";

export type PriorDayBlocker = {
  /** Business date that must be finished first. */
  businessDate: string;
  reason: "open_session" | "unreconciled" | "report_not_sent";
  message: string;
  catchUpHref: string;
};

function catchUpHref(date: string): string {
  return `/inventory/catch-up?date=${encodeURIComponent(date)}`;
}

/**
 * Before opening a session or selling on `businessDate` (EAT calendar day),
 * the previous operating day must be: drawer closed → reconciled → director report sent.
 */
export async function getPriorDayBlocker(
  outletId: string,
  businessDate: string
): Promise<PriorDayBlocker | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: openSession } = await supabase
    .from("cash_sessions")
    .select("id, business_date, status")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    openSession?.business_date &&
    openSession.business_date < businessDate
  ) {
    const d = openSession.business_date;
    return {
      businessDate: d,
      reason: "open_session",
      message: `Close and reconcile ${d} on Catch-up before opening ${businessDate}. The prior day’s drawer is still open.`,
      catchUpHref: catchUpHref(d),
    };
  }

  const lookbackFrom = addDaysIso(businessDate, -60);

  const [{ data: sessions }, { data: sales }, { data: closings }] =
    await Promise.all([
      supabase
        .from("cash_sessions")
        .select("business_date, status")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", outletId)
        .gte("business_date", lookbackFrom)
        .lt("business_date", businessDate)
        .order("business_date", { ascending: false }),
      supabase
        .from("sales")
        .select("sale_date")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", outletId)
        .eq("status", "completed")
        .gte("sale_date", `${lookbackFrom}T00:00:00.000Z`)
        .lt("sale_date", `${businessDate}T00:00:00.000Z`)
        .order("sale_date", { ascending: false })
        .limit(50),
      supabase
        .from("daily_closings")
        .select("business_date, status, report_sent_at")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", outletId)
        .gte("business_date", lookbackFrom)
        .lt("business_date", businessDate),
    ]);

  const operatingDates = new Set<string>();
  for (const s of sessions ?? []) {
    if (s.business_date) operatingDates.add(String(s.business_date));
  }
  for (const s of sales ?? []) {
    operatingDates.add(String(s.sale_date).slice(0, 10));
  }

  const priorOperatingDay = Array.from(operatingDates)
    .filter((d) => d < businessDate)
    .sort()
    .reverse()[0];

  if (!priorOperatingDay) {
    return null;
  }

  const closing = (closings ?? []).find(
    (c) => String(c.business_date) === priorOperatingDay
  );

  if (!closing || closing.status !== "reconciled") {
    return {
      businessDate: priorOperatingDay,
      reason: "unreconciled",
      message: `Complete ${priorOperatingDay} on Catch-up first: close the cash session, reconcile the day, and send the report to the director before selling or opening ${businessDate}.`,
      catchUpHref: catchUpHref(priorOperatingDay),
    };
  }

  if (!closing.report_sent_at) {
    return {
      businessDate: priorOperatingDay,
      reason: "report_not_sent",
      message: `${priorOperatingDay} is reconciled but the director report was not sent. Open Catch-up, send WhatsApp to the director, then continue.`,
      catchUpHref: catchUpHref(priorOperatingDay),
    };
  }

  return null;
}

export async function assertPriorDayClear(
  outletId: string,
  businessDate: string
): Promise<{ ok: true } | { ok: false; message: string; catchUpHref?: string }> {
  const blocker = await getPriorDayBlocker(outletId, businessDate);
  if (!blocker) return { ok: true };
  return {
    ok: false,
    message: blocker.message,
    catchUpHref: blocker.catchUpHref,
  };
}
