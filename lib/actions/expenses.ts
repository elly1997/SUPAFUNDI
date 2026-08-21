"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveExpenseAccountCode } from "@/lib/accounting/expense-coa";
import {
  buildExpenseJournalLines,
  buildReversingJournalLines,
  type JournalLineInput,
} from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { withdrawFromCollectionAccount } from "@/lib/actions/banking";
import { requireManagerContext } from "@/lib/server/require-manager";
import { checkBusinessDayMutable } from "@/lib/server/business-day-guard";
import { requireOrgContext } from "@/lib/server/org-context";
import { resolveWorkingOutletId } from "@/lib/customers/working-outlet";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { validateCollectionAccount } from "@/lib/finance/collection-accounts";
import { resolveBusinessDate } from "@/lib/utils/iso-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const expensePaymentMethod = z.enum([
  "cash",
  "mpesa",
  "bank_transfer",
  "on_account",
]);

const recordExpenseInput = z.object({
  outletId: z.string().uuid().nullable().optional(),
  category: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  amount: z.coerce.number().positive(),
  /** @deprecated — use paymentMethod */
  paidFromCash: z.boolean().optional(),
  paymentMethod: expensePaymentMethod.optional(),
  bankAccountId: z.string().uuid().optional(),
  referenceNo: z.string().max(100).optional(),
  expenseDate: z.string().optional(),
  employeeId: z.string().uuid().optional(),
});

function resolveExpensePayment(
  input: z.infer<typeof recordExpenseInput>
): z.infer<typeof expensePaymentMethod> {
  if (input.paymentMethod) return input.paymentMethod;
  return input.paidFromCash === false ? "on_account" : "cash";
}

export type ExpenseListRow = {
  id: string;
  category: string | null;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  outlet_id: string | null;
  employee_id: string | null;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function loadExpenseJournalLines(
  supabase: Supabase,
  expenseId: string
): Promise<JournalLineInput[]> {
  const { data: entry } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_id", expenseId)
    .eq("source_type", "expense")
    .eq("is_reversal", false)
    .maybeSingle();
  if (!entry) return [];

  const { data: lines } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit, credit")
    .eq("journal_entry_id", entry.id);
  if (!lines?.length) return [];

  const accountIds = Array.from(new Set(lines.map((l) => l.account_id)));
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, code")
    .in("id", accountIds);
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));

  return lines
    .map((l) => {
      const code = codeById.get(l.account_id);
      if (!code) return null;
      return {
        accountCode: code,
        debit: Number(l.debit),
        credit: Number(l.credit),
      };
    })
    .filter((l): l is JournalLineInput => l !== null);
}

export async function listExpenses(
  limit = 50,
  filters?: {
    outletId?: string | null;
    fromDate?: string;
    toDate?: string;
  }
): Promise<ExpenseListRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const scopedOutletId =
    filters?.outletId ?? (await resolveWorkingOutletId(ctx));
  if (!scopedOutletId) return [];
  let query = supabase
    .from("expenses")
    .select(
      "id, category, description, amount, expense_date, payment_method, outlet_id, employee_id"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", scopedOutletId);
  if (filters?.fromDate) {
    query = query.gte("expense_date", filters.fromDate);
  }
  if (filters?.toDate) {
    query = query.lte("expense_date", filters.toDate);
  }
  const { data, error } = await query
    .order("expense_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({
    id: e.id,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
    expense_date: e.expense_date,
    payment_method: e.payment_method,
    outlet_id: e.outlet_id,
    employee_id: e.employee_id ?? null,
  }));
}

/** Reverse GL and remove a mis-posted expense (e.g. bank deposit recorded as bank charges). */
export async function voidExpense(
  expenseId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireManagerContext();
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: expense } = await supabase
      .from("expenses")
      .select("id, category, description, amount, expense_date, outlet_id")
      .eq("id", expenseId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!expense) {
      return { ok: false, message: "Expense not found." };
    }

    const originalLines = await loadExpenseJournalLines(supabase, expenseId);
    if (originalLines.length > 0) {
      const reverseLines = buildReversingJournalLines(originalLines);
      const label = formatExpenseCategoryLabel(expense.category ?? "misc");
      const journal = await postJournalEntry({
        description: `Void expense: ${label} — ${expense.description ?? ""}`.trim(),
        sourceType: "manual",
        sourceId: expenseId,
        outletId: expense.outlet_id ?? undefined,
        entryDate: expense.expense_date,
        lines: reverseLines,
      });
      if (!journal.ok) {
        return { ok: false, message: journal.message };
      }
    }

    const { error: delErr } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)
      .eq("organization_id", ctx.organizationId);
    if (delErr) {
      return { ok: false, message: delErr.message };
    }

    revalidatePath("/finance/expenses");
    revalidatePath("/finance/banking");
    revalidatePath("/finance/payroll");
    revalidatePath("/daily-closing");
    revalidatePath("/pos");
    revalidatePath("/reports");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Void expense failed",
    };
  }
}

export async function recordExpense(
  raw: z.infer<typeof recordExpenseInput>
): Promise<{ ok: true; expenseId: string } | { ok: false; message: string }> {
  try {
    const input = recordExpenseInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const categoryKey = input.category.trim().toLowerCase();
    if (
      categoryKey === "salary_advance" ||
      categoryKey === "salary advance"
    ) {
      if (!input.employeeId) {
        return {
          ok: false,
          message: "Select the employee receiving this salary advance.",
        };
      }
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("id", input.employeeId)
        .eq("organization_id", ctx.organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (!emp) {
        return { ok: false, message: "Employee not found or inactive." };
      }
    }

    if (
      categoryKey === "bank" ||
      categoryKey === "bank_deposit" ||
      categoryKey === "bank deposit"
    ) {
      return {
        ok: false,
        message:
          "Moving cash to the bank is not an expense. Use POS → Cash out → To bank, or Finance → Banking.",
      };
    }

    const accountCode = await resolveExpenseAccountCode(input.category);
    const expenseDate = resolveBusinessDate(input.expenseDate);
    const paymentMethod = resolveExpensePayment(input);
    const accountCheck = validateCollectionAccount(
      paymentMethod,
      input.bankAccountId
    );
    if (!accountCheck.ok) return accountCheck;

    const outletId = input.outletId ?? ctx.outletId;
    const dayCheck = await checkBusinessDayMutable(outletId, expenseDate);
    if (!dayCheck.ok) return dayCheck;

    const { data: expense, error: expErr } = await supabase
      .from("expenses")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: outletId,
        category: input.category.trim(),
        description: input.description?.trim() || null,
        amount: input.amount,
        payment_method: paymentMethod,
        reference_no: input.referenceNo?.trim() || null,
        expense_date: expenseDate,
        created_by: ctx.userId,
        employee_id: input.employeeId ?? null,
      })
      .select("id")
      .single();
    if (expErr || !expense) {
      return { ok: false, message: expErr?.message ?? "Expense insert failed" };
    }

    const journal = await postJournalEntry({
      description: `Expense: ${input.category} — ${input.description ?? ""}`.trim(),
      sourceType: "expense",
      sourceId: expense.id,
      outletId: outletId ?? undefined,
      entryDate: expenseDate,
      lines: buildExpenseJournalLines({
        amount: input.amount,
        paymentMethod,
        categoryAccountCode: accountCode,
      }),
    });
    if (!journal.ok) {
      await supabase.from("expenses").delete().eq("id", expense.id);
      return { ok: false, message: journal.message };
    }

    if (
      (paymentMethod === "mpesa" || paymentMethod === "bank_transfer") &&
      input.bankAccountId
    ) {
      const label = formatExpenseCategoryLabel(input.category.trim());
      const bank = await withdrawFromCollectionAccount(
        input.bankAccountId,
        input.amount,
        `Expense: ${label}${input.description ? ` — ${input.description.trim()}` : ""}`,
        {
          referenceNo: input.referenceNo?.trim() || undefined,
          transactionDate: expenseDate,
        }
      );
      if (!bank.ok) {
        await supabase.from("expenses").delete().eq("id", expense.id);
        return bank;
      }
    }

    if (
      categoryKey === "salary_advance" ||
      categoryKey === "salary advance"
    ) {
      const { refreshPayrollRun } = await import("@/lib/actions/payroll");
      await refreshPayrollRun(expenseDate.slice(0, 7));
    }

    revalidatePath("/finance/expenses");
    revalidatePath("/finance/banking");
    revalidatePath("/finance/payroll");
    return { ok: true, expenseId: expense.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Record expense failed",
    };
  }
}
