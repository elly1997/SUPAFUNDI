"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  computeDayCashSummary,
  getPreviousReconciledClosing,
  getReconciledDatesInRange,
} from "@/lib/actions/daily-closing";
import {
  assertPriorDayClear,
  getPriorDayBlocker,
  type PriorDayBlocker,
} from "@/lib/server/prior-day-gate";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import {
  businessDateFromTimestamptz,
  isoDateToTimestamptz,
  resolveBusinessDate,
  todayIso,
} from "@/lib/utils/iso-date";

export type CashSessionRow = {
  id: string;
  outlet_id: string | null;
  business_date: string;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  variance: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
};

export type DrawerStatus = {
  session: CashSessionRow | null;
  /** Business date the UI is working on. */
  workingDate: string;
  /** Open session is for a different day than workingDate. */
  dateMismatch: boolean;
  /** Live expected cash in drawer (full daily-closing formula). */
  liveExpectedCash: number;
  /** Opening float from prior reconciled day — default for open drawer. */
  suggestedOpening: number;
  reconciled: boolean;
  reconciledClosing: number | null;
  /** Blocker when prior day must be closed/reconciled/sent first. */
  priorDayBlocker: PriorDayBlocker | null;
  /** East Africa "today" for display. */
  eatToday: string;
};

function mapSessionRow(data: {
  id: string;
  outlet_id: string | null;
  business_date?: string | null;
  opened_at: string;
  opening_balance: number;
  closing_balance: number | null;
  expected_balance: number | null;
  variance: number | null;
  status: string;
  closed_at: string | null;
}): CashSessionRow {
  return {
    id: data.id,
    outlet_id: data.outlet_id,
    business_date:
      data.business_date ?? businessDateFromTimestamptz(data.opened_at),
    opening_balance: Number(data.opening_balance),
    closing_balance: data.closing_balance ? Number(data.closing_balance) : null,
    expected_balance: data.expected_balance
      ? Number(data.expected_balance)
      : null,
    variance: data.variance != null ? Number(data.variance) : null,
    status: data.status,
    opened_at: data.opened_at,
    closed_at: data.closed_at,
  };
}

const sessionSelect =
  "id, outlet_id, business_date, opening_balance, closing_balance, expected_balance, variance, status, opened_at, closed_at";

export async function getSuggestedOpeningBalance(
  outletId: string,
  businessDate: string
): Promise<number> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  return getPreviousReconciledClosing(
    supabase,
    ctx.organizationId,
    outletId,
    businessDate
  );
}

/** Drawer state for POS / catch-up — live expected cash matches daily closing. */
export async function getDrawerStatus(
  outletId: string,
  workingDate?: string
): Promise<DrawerStatus> {
  const date = resolveBusinessDate(workingDate);
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const [session, suggestedOpening, closingResult, priorDayBlocker] =
    await Promise.all([
    getOpenCashSession(outletId),
    getPreviousReconciledClosing(
      supabase,
      ctx.organizationId,
      outletId,
      date
    ),
    supabase
      .from("daily_closings")
      .select("status, closing_balance")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", outletId)
      .eq("business_date", date)
      .maybeSingle(),
    getPriorDayBlocker(outletId, date),
  ]);

  const closing = closingResult.data;
  const reconciled = closing?.status === "reconciled";
  const reconciledClosing =
    reconciled && closing?.closing_balance != null
      ? Number(closing.closing_balance)
      : null;

  const sessionDate = session?.business_date ?? null;
  const dateMismatch = !!session && sessionDate !== date;

  let liveExpectedCash = 0;
  if (session && !dateMismatch) {
    const summary = await computeDayCashSummary(
      outletId,
      session.business_date
    );
    liveExpectedCash = summary.expectedCash;
  }

  return {
    session,
    workingDate: date,
    dateMismatch,
    liveExpectedCash,
    suggestedOpening: roundMoney(suggestedOpening),
    reconciled,
    reconciledClosing,
    priorDayBlocker,
    eatToday: todayIso(),
  };
}

export async function listCashSessionHistory(
  outletId?: string | null,
  limit = 30
): Promise<CashSessionRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("cash_sessions")
    .select(sessionSelect)
    .eq("organization_id", ctx.organizationId)
    .order("business_date", { ascending: false })
    .order("opened_at", { ascending: false })
    .limit(limit);
  const filterOutlet = outletId ?? ctx.outletId;
  if (filterOutlet) q = q.eq("outlet_id", filterOutlet);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSessionRow);
}

export async function getOpenCashSession(
  outletId: string
): Promise<CashSessionRow | null> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .select(sessionSelect)
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapSessionRow(data);
}

const openSessionInput = z.object({
  outletId: z.string().uuid(),
  openingBalance: z.coerce.number().nonnegative().optional(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export async function openCashSession(
  raw: z.infer<typeof openSessionInput>
): Promise<{ ok: true; sessionId: string } | { ok: false; message: string }> {
  try {
    const input = openSessionInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const businessDate = resolveBusinessDate(input.businessDate);

    const prior = await assertPriorDayClear(input.outletId, businessDate);
    if (!prior.ok) {
      return { ok: false, message: prior.message };
    }

    const existing = await getOpenCashSession(input.outletId);
    if (existing) {
      if (existing.business_date !== businessDate) {
        return {
          ok: false,
          message: `Close the drawer for ${existing.business_date} before opening ${businessDate}.`,
        };
      }
      return {
        ok: false,
        message: "A cash session is already open for this outlet.",
      };
    }

    const reconciled = await getReconciledDatesInRange(
      businessDate,
      businessDate,
      input.outletId
    );
    if (reconciled.includes(businessDate)) {
      return {
        ok: false,
        message:
          "This business day is already reconciled. Choose another date in the header.",
      };
    }

    const suggested = await getPreviousReconciledClosing(
      supabase,
      ctx.organizationId,
      input.outletId,
      businessDate
    );
    const openingBalance = roundMoney(
      input.openingBalance ?? suggested
    );

    const { data, error } = await supabase
      .from("cash_sessions")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId,
        cashier_id: ctx.userId,
        business_date: businessDate,
        opening_balance: openingBalance,
        status: "open",
        opened_at: isoDateToTimestamptz(businessDate),
        notes: input.notes?.trim() || null,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Open session failed" };
    }
    revalidatePath("/pos");
    revalidatePath("/finance/cash-sessions");
    revalidatePath("/inventory/catch-up");
    revalidatePath("/daily-closing");
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
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
});

export async function closeCashSession(
  raw: z.infer<typeof closeSessionInput>
): Promise<
  | {
      ok: true;
      variance: number;
      expected: number;
      businessDate: string;
      needsReconcile: boolean;
    }
  | { ok: false; message: string }
> {
  try {
    const input = closeSessionInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: session } = await supabase
      .from("cash_sessions")
      .select("id, outlet_id, opening_balance, business_date, opened_at, status")
      .eq("id", input.sessionId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!session || session.status !== "open") {
      return { ok: false, message: "Session not found or already closed." };
    }
    if (!session.outlet_id) {
      return { ok: false, message: "Session has no outlet." };
    }

    const sessionBusinessDate =
      session.business_date ??
      businessDateFromTimestamptz(session.opened_at);

    const summary = await computeDayCashSummary(
      session.outlet_id,
      sessionBusinessDate
    );
    const expected = summary.expectedCash;
    const variance = roundMoney(input.closingBalance - expected);

    const { error } = await supabase
      .from("cash_sessions")
      .update({
        closing_balance: input.closingBalance,
        expected_balance: expected,
        variance,
        status: "closed",
        closed_at: isoDateToTimestamptz(
          resolveBusinessDate(input.businessDate ?? sessionBusinessDate)
        ),
        notes: input.notes?.trim() || null,
      })
      .eq("id", input.sessionId);
    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/pos");
    revalidatePath("/finance/cash-sessions");
    revalidatePath("/inventory/catch-up");
    revalidatePath("/daily-closing");

    return {
      ok: true,
      variance,
      expected,
      businessDate: sessionBusinessDate,
      needsReconcile: true,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Close session failed",
    };
  }
}
