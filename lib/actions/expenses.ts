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
import { requireManagerContext } from "@/lib/server/require-manager";
import { requireOrgContext } from "@/lib/server/org-context";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { resolveBusinessDate } from "@/lib/utils/iso-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const recordExpenseInput = z.object({
  outletId: z.string().uuid().nullable().optional(),
  category: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  amount: z.coerce.number().positive(),
  paidFromCash: z.boolean().default(true),
  paymentMethod: z.string().optional(),
  referenceNo: z.string().max(100).optional(),
  expenseDate: z.string().optional(),
});

export type ExpenseListRow = {
  id: string;
  category: string | null;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  outlet_id: string | null;
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
  let query = supabase
    .from("expenses")
    .select(
      "id, category, description, amount, expense_date, payment_method, outlet_id"
    )
    .eq("organization_id", ctx.organizationId);
  if (filters?.outletId) {
    query = query.eq("outlet_id", filters.outletId);
  }
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

    const { data: expense, error: expErr } = await supabase
      .from("expenses")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: input.outletId ?? ctx.outletId,
        category: input.category.trim(),
        description: input.description?.trim() || null,
        amount: input.amount,
        payment_method: input.paymentMethod ?? (input.paidFromCash ? "cash" : "credit"),
        reference_no: input.referenceNo?.trim() || null,
        expense_date: resolveBusinessDate(input.expenseDate),
        created_by: ctx.userId,
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
      outletId: input.outletId ?? ctx.outletId ?? undefined,
      entryDate: resolveBusinessDate(input.expenseDate),
      lines: buildExpenseJournalLines({
        amount: input.amount,
        paidFromCash: input.paidFromCash,
        categoryAccountCode: accountCode,
      }),
    });
    if (!journal.ok) {
      await supabase.from("expenses").delete().eq("id", expense.id);
      return { ok: false, message: journal.message };
    }

    revalidatePath("/finance/expenses");
    return { ok: true, expenseId: expense.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Record expense failed",
    };
  }
}
