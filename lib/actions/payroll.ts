"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { postJournalEntry } from "@/lib/actions/accounting";
import { withdrawFromCollectionAccount } from "@/lib/actions/banking";
import { buildPayrollPaymentJournalLines } from "@/lib/accounting/posting-rules";
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { validateCollectionAccount } from "@/lib/finance/collection-accounts";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function payrollDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => any;
  };
}

const PAYROLL_MONTH = /^\d{4}-\d{2}$/;

function monthBounds(payrollMonth: string): { from: string; to: string } {
  const [y, m] = payrollMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${payrollMonth}-01`,
    to: `${payrollMonth}-${String(lastDay).padStart(2, "0")}`,
  };
}

export type PayrollLineDetail = {
  id: string;
  employee_id: string;
  employee_name: string;
  gross_salary: number;
  advances_total: number;
  bonuses_total: number;
  net_salary: number;
  payment_method: string | null;
  reference_no: string | null;
  paid_at: string | null;
  advance_items: { id: string; amount: number; expense_date: string; description: string | null }[];
  bonus_items: { id: string; amount: number; bonus_date: string; description: string | null }[];
};

export type PayrollRunDetail = {
  id: string;
  payroll_month: string;
  status: "open" | "closed";
  closed_at: string | null;
  lines: PayrollLineDetail[];
  totals: {
    gross: number;
    advances: number;
    bonuses: number;
    net: number;
  };
};

async function sumAdvancesForEmployee(
  supabase: Supabase,
  organizationId: string,
  outletId: string,
  employeeId: string,
  from: string,
  to: string
): Promise<{ total: number; items: PayrollLineDetail["advance_items"] }> {
  const { data } = await supabase
    .from("expenses")
    .select("id, amount, expense_date, description, category")
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId)
    .eq("employee_id", employeeId)
    .gte("expense_date", from)
    .lte("expense_date", to);

  const items: PayrollLineDetail["advance_items"] = [];
  let total = 0;
  for (const row of data ?? []) {
    const cat = (row.category ?? "").toLowerCase();
    if (cat !== "salary_advance" && cat !== "salary advance") continue;
    const amount = Number(row.amount);
    total += amount;
    items.push({
      id: row.id,
      amount,
      expense_date: row.expense_date,
      description: row.description,
    });
  }
  return { total: roundMoney(total), items };
}

async function sumBonusesForEmployee(
  supabase: Supabase,
  organizationId: string,
  outletId: string,
  employeeId: string,
  from: string,
  to: string
): Promise<{ total: number; items: PayrollLineDetail["bonus_items"] }> {
  const { data } = await payrollDb(supabase)
    .from("employee_bonuses")
    .select("id, amount, bonus_date, description")
    .eq("organization_id", organizationId)
    .eq("outlet_id", outletId)
    .eq("employee_id", employeeId)
    .gte("bonus_date", from)
    .lte("bonus_date", to);

  const items = ((data ?? []) as any[]).map((b: any) => ({
    id: b.id,
    amount: Number(b.amount),
    bonus_date: b.bonus_date,
    description: b.description,
  }));
  const total = roundMoney(items.reduce((s: number, b: any) => s + b.amount, 0));
  return { total, items };
}

export async function refreshPayrollRun(
  payrollMonth: string
): Promise<
  { ok: true; run: PayrollRunDetail } | { ok: false; message: string }
> {
  try {
    if (!PAYROLL_MONTH.test(payrollMonth)) {
      return { ok: false, message: "Use payroll month YYYY-MM." };
    }
    await requireManagerContext();
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return { ok: false, message: "Select a working outlet first." };
    }
    const supabase = await createServerSupabaseClient();
    const { from, to } = monthBounds(payrollMonth);

    let { data: run } = await payrollDb(supabase)
      .from("payroll_runs")
      .select("id, payroll_month, status, closed_at")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId)
      .eq("payroll_month", payrollMonth)
      .maybeSingle();

    if (run?.status === "closed") {
      return { ok: false, message: "This payroll month is already closed." };
    }

    if (!run) {
      const { data: created, error } = await payrollDb(supabase)
        .from("payroll_runs")
        .insert({
          organization_id: ctx.organizationId,
          outlet_id: ctx.outletId,
          payroll_month: payrollMonth,
          status: "open",
        })
        .select("id, payroll_month, status, closed_at")
        .single();
      if (error || !created) {
        return { ok: false, message: error?.message ?? "Could not create payroll run" };
      }
      run = created;
    }

    const { data: employees } = await payrollDb(supabase)
      .from("employees")
      .select("id, full_name, gross_monthly_salary")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId)
      .eq("is_active", true);

    for (const emp of employees ?? []) {
      const gross = roundMoney(Number(emp.gross_monthly_salary));
      const { total: advances } = await sumAdvancesForEmployee(
          supabase,
          ctx.organizationId,
          ctx.outletId,
          emp.id,
          from,
          to
        );
      const { total: bonuses } = await sumBonusesForEmployee(
        supabase,
        ctx.organizationId,
        ctx.outletId,
        emp.id,
        from,
        to
      );
      const net = roundMoney(gross + bonuses - advances);
      if (net < 0) {
        return {
          ok: false,
          message: `${emp.full_name} has advances (${advances}) exceeding gross + bonuses. Adjust advances or add bonus before closing.`,
        };
      }

      await supabase.from("payroll_lines").upsert(
        {
          payroll_run_id: run.id,
          employee_id: emp.id,
          gross_salary: gross,
          advances_total: advances,
          bonuses_total: bonuses,
          net_salary: net,
        },
        { onConflict: "payroll_run_id,employee_id" }
      );
    }

    const detail = await getPayrollRunDetail(payrollMonth);
    if (!detail) {
      return { ok: false, message: "Could not load payroll run." };
    }
    revalidatePath("/finance/payroll");
    return { ok: true, run: detail };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Refresh payroll failed",
    };
  }
}

export async function getPayrollRunDetail(
  payrollMonth: string
): Promise<PayrollRunDetail | null> {
  const ctx = await requireOrgContext();
  if (!ctx.outletId) return null;
  const supabase = await createServerSupabaseClient();
  const { from, to } = monthBounds(payrollMonth);

  const { data: run } = await payrollDb(supabase)
    .from("payroll_runs")
    .select("id, payroll_month, status, closed_at")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", ctx.outletId)
    .eq("payroll_month", payrollMonth)
    .maybeSingle();

  if (!run) return null;

  const { data: lines } = await supabase
    .from("payroll_lines")
    .select(
      "id, employee_id, gross_salary, advances_total, bonuses_total, net_salary, payment_method, reference_no, paid_at"
    )
    .eq("payroll_run_id", run.id);

  const { data: employees } = await payrollDb(supabase)
    .from("employees")
    .select("id, full_name")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", ctx.outletId);

  const nameById = new Map<string, string>(
    ((employees ?? []) as any[]).map((e: any) => [String(e.id), String(e.full_name)])
  );

  const lineDetails: PayrollLineDetail[] = [];
  let grossSum = 0;
  let advSum = 0;
  let bonusSum = 0;
  let netSum = 0;

  for (const line of lines ?? []) {
    const { items: advanceItems } = await sumAdvancesForEmployee(
      supabase,
      ctx.organizationId,
      ctx.outletId,
      line.employee_id,
      from,
      to
    );
    const { items: bonusItems } = await sumBonusesForEmployee(
      supabase,
      ctx.organizationId,
      ctx.outletId,
      line.employee_id,
      from,
      to
    );
    const gross = Number(line.gross_salary);
    const advances = Number(line.advances_total);
    const bonuses = Number(line.bonuses_total);
    const net = Number(line.net_salary);
    grossSum += gross;
    advSum += advances;
    bonusSum += bonuses;
    netSum += net;

    lineDetails.push({
      id: line.id,
      employee_id: line.employee_id,
      employee_name: nameById.get(line.employee_id) ?? "—",
      gross_salary: gross,
      advances_total: advances,
      bonuses_total: bonuses,
      net_salary: net,
      payment_method: line.payment_method,
      reference_no: line.reference_no,
      paid_at: line.paid_at,
      advance_items: advanceItems,
      bonus_items: bonusItems,
    });
  }

  lineDetails.sort((a, b) => a.employee_name.localeCompare(b.employee_name));

  return {
    id: run.id,
    payroll_month: run.payroll_month,
    status: run.status as "open" | "closed",
    closed_at: run.closed_at,
    lines: lineDetails,
    totals: {
      gross: roundMoney(grossSum),
      advances: roundMoney(advSum),
      bonuses: roundMoney(bonusSum),
      net: roundMoney(netSum),
    },
  };
}

const bonusInput = z.object({
  employeeId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  bonusDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional(),
});

export async function recordEmployeeBonus(
  raw: z.infer<typeof bonusInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const input = bonusInput.parse(raw);
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return { ok: false, message: "Select a working outlet first." };
    }
    const supabase = await createServerSupabaseClient();

    const { error } = await payrollDb(supabase).from("employee_bonuses").insert({
      organization_id: ctx.organizationId,
      outlet_id: ctx.outletId,
      employee_id: input.employeeId,
      amount: input.amount,
      bonus_date: input.bonusDate,
      description: input.description?.trim() || null,
      created_by: ctx.userId,
    });
    if (error) return { ok: false, message: error.message };

    const month = input.bonusDate.slice(0, 7);
    await refreshPayrollRun(month);
    revalidatePath("/finance/payroll");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not record bonus",
    };
  }
}

const closeLineSchema = z.object({
  lineId: z.string().uuid(),
  paymentMethod: z.enum(["cash", "mpesa", "bank_transfer"]),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
});

const closePayrollSchema = z.object({
  payrollMonth: z.string().regex(PAYROLL_MONTH),
  lines: z.array(closeLineSchema).min(1),
  notes: z.string().max(500).optional(),
});

export async function closePayrollRun(
  raw: z.infer<typeof closePayrollSchema>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const input = closePayrollSchema.parse(raw);
    const ctx = await requireOrgContext();
    if (!ctx.outletId) {
      return { ok: false, message: "Select a working outlet first." };
    }
    const supabase = await createServerSupabaseClient();

    const refresh = await refreshPayrollRun(input.payrollMonth);
    if (!refresh.ok) return refresh;

    const run = refresh.run;
    if (run.status === "closed") {
      return { ok: false, message: "Payroll month already closed." };
    }

    const lineById = new Map(run.lines.map((l) => [l.id, l]));
    const paymentDate = `${input.payrollMonth}-${String(new Date().getDate()).padStart(2, "0")}`;

    for (const pay of input.lines) {
      const line = lineById.get(pay.lineId);
      if (!line) {
        return { ok: false, message: "Invalid payroll line." };
      }
      if (line.net_salary <= 0 && line.gross_salary + line.bonuses_total <= 0) {
        continue;
      }

      const accountCheck = validateCollectionAccount(
        pay.paymentMethod,
        pay.bankAccountId
      );
      if (!accountCheck.ok) return accountCheck;

      const journal = await postJournalEntry({
        description: `Payroll ${input.payrollMonth} — ${line.employee_name}`,
        sourceType: "payroll",
        sourceId: pay.lineId,
        outletId: ctx.outletId,
        entryDate: paymentDate,
        lines: buildPayrollPaymentJournalLines({
          grossSalary: line.gross_salary,
          bonusesTotal: line.bonuses_total,
          advancesTotal: line.advances_total,
          netSalary: line.net_salary,
          paymentMethod: pay.paymentMethod,
          employeeName: line.employee_name,
        }),
      });
      if (!journal.ok) return { ok: false, message: journal.message };

      if (
        line.net_salary > 0 &&
        (pay.paymentMethod === "mpesa" || pay.paymentMethod === "bank_transfer") &&
        pay.bankAccountId
      ) {
        const bank = await withdrawFromCollectionAccount(
          pay.bankAccountId,
          line.net_salary,
          `Payroll ${input.payrollMonth} — ${line.employee_name}`,
          {
            referenceNo: pay.referenceNo?.trim() || undefined,
            transactionDate: paymentDate,
          }
        );
        if (!bank.ok) return bank;
      }

      await supabase
        .from("payroll_lines")
        .update({
          payment_method: pay.paymentMethod,
          bank_account_id: pay.bankAccountId ?? null,
          reference_no: pay.referenceNo?.trim() || null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", pay.lineId);
    }

    await payrollDb(supabase)
      .from("payroll_runs")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId,
        notes: input.notes?.trim() || null,
      })
      .eq("id", run.id);

    revalidatePath("/finance/payroll");
    revalidatePath("/finance/banking");
    revalidatePath("/finance/expenses");
    revalidatePath("/reports");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Close payroll failed",
    };
  }
}

export async function listPayrollMonths(): Promise<
  { payroll_month: string; status: string; net_total: number }[]
> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data: runs } = await payrollDb(supabase)
    .from("payroll_runs")
    .select("id, payroll_month, status")
    .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", ctx.outletId)
    .order("payroll_month", { ascending: false });

  const out: { payroll_month: string; status: string; net_total: number }[] = [];
  for (const run of runs ?? []) {
    const { data: lines } = await supabase
      .from("payroll_lines")
      .select("net_salary")
      .eq("payroll_run_id", run.id);
    const net = roundMoney(
      (lines ?? []).reduce((s, l) => s + Number(l.net_salary), 0)
    );
    out.push({
      payroll_month: run.payroll_month,
      status: run.status,
      net_total: net,
    });
  }
  return out;
}
