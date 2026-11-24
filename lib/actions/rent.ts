"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { resolveWorkingOutletId } from "@/lib/customers/working-outlet";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { todayIso } from "@/lib/utils/iso-date";

export type RentSettings = {
  monthlyAmount: number;
  /** First month rent is due, YYYY-MM. */
  startMonth: string;
  /** Rent payments on/after this date count toward the tracker (YYYY-MM-DD). */
  paymentsFrom: string;
};

export type RentMonthRow = {
  month: string;
  due: number;
  paid: number;
  balance: number;
};

export type RentPaymentRow = {
  id: string;
  expense_date: string;
  amount: number;
  description: string | null;
};

export type RentSummary = {
  outletId: string;
  configured: boolean;
  settings: RentSettings | null;
  totalDue: number;
  totalPaid: number;
  /** Positive = still owed to landlord, negative = paid ahead. */
  balance: number;
  months: RentMonthRow[];
  payments: RentPaymentRow[];
};

const MONTH = /^\d{4}-\d{2}$/;

function settingKey(outletId: string): string {
  return `rent:${outletId}`;
}

function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseSettings(raw: string | null | undefined): RentSettings | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<RentSettings>;
    if (
      typeof v.monthlyAmount === "number" &&
      v.monthlyAmount > 0 &&
      typeof v.startMonth === "string" &&
      MONTH.test(v.startMonth) &&
      typeof v.paymentsFrom === "string"
    ) {
      return {
        monthlyAmount: v.monthlyAmount,
        startMonth: v.startMonth,
        paymentsFrom: v.paymentsFrom,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Rent owed vs paid for one outlet. Landlord part-payments and advances are ordinary
 * "Rent" expenses; they are allocated oldest-month-first against the monthly rent.
 */
export async function getRentSummary(
  outletId?: string | null
): Promise<RentSummary | null> {
  const ctx = await requireOrgContext();
  const outlet = await resolveWorkingOutletId(ctx, outletId);
  if (!outlet) return null;
  const supabase = await createServerSupabaseClient();

  const { data: setting } = await supabase
    .from("settings")
    .select("value")
    .eq("organization_id", ctx.organizationId)
    .eq("key", settingKey(outlet))
    .maybeSingle();
  const settings = parseSettings(setting?.value);
  if (!settings) {
    return {
      outletId: outlet,
      configured: false,
      settings: null,
      totalDue: 0,
      totalPaid: 0,
      balance: 0,
      months: [],
      payments: [],
    };
  }

  const { data: rows } = await supabase
    .from("expenses")
    .select("id, expense_date, amount, description, category")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outlet)
    .eq("category", "rent")
    .gte("expense_date", settings.paymentsFrom)
    .order("expense_date", { ascending: true });
  const payments: RentPaymentRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    expense_date: r.expense_date,
    amount: Number(r.amount),
    description: r.description,
  }));
  const totalPaid = roundMoney(payments.reduce((s, p) => s + p.amount, 0));

  const currentMonth = todayIso().slice(0, 7);
  const months: RentMonthRow[] = [];
  let remaining = totalPaid;
  let m = settings.startMonth;
  /** Always cover through the current month; extend while there is prepaid cash. */
  while (months.length < 60) {
    const due = m <= currentMonth ? settings.monthlyAmount : 0;
    const paid = roundMoney(Math.min(remaining, settings.monthlyAmount));
    months.push({ month: m, due, paid, balance: roundMoney(due - paid) });
    remaining = roundMoney(remaining - paid);
    m = addMonth(m, 1);
    if (m > currentMonth && remaining <= 0) break;
  }
  const totalDue = roundMoney(months.reduce((s, r) => s + r.due, 0));

  return {
    outletId: outlet,
    configured: true,
    settings,
    totalDue,
    totalPaid,
    balance: roundMoney(totalDue - totalPaid),
    months,
    payments,
  };
}

const saveInput = z.object({
  outletId: z.string().uuid().nullable().optional(),
  monthlyAmount: z.coerce.number().positive(),
  startMonth: z.string().regex(MONTH),
  paymentsFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function saveRentSettings(
  raw: z.infer<typeof saveInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const input = saveInput.parse(raw);
    const ctx = await requireOrgContext();
    const outlet = await resolveWorkingOutletId(ctx, input.outletId);
    if (!outlet) return { ok: false, message: "Select an outlet first." };
    const supabase = await createServerSupabaseClient();
    const value: RentSettings = {
      monthlyAmount: input.monthlyAmount,
      startMonth: input.startMonth,
      paymentsFrom: input.paymentsFrom,
    };
    const { error } = await supabase.from("settings").upsert(
      {
        organization_id: ctx.organizationId,
        key: settingKey(outlet),
        value: JSON.stringify(value),
      },
      { onConflict: "organization_id,key" }
    );
    if (error) return { ok: false, message: error.message };
    revalidatePath("/finance/expenses");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not save rent settings",
    };
  }
}
