"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildExpenseJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const EXPENSE_ACCOUNT_MAP: Record<string, string> = {
  rent: "6000",
  utilities: "6010",
  wages: "6020",
  bank: "6030",
  misc: "6040",
  stock: "6040",
};

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
};

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
    .select("id, category, description, amount, expense_date, payment_method")
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
  }));
}

export async function recordExpense(
  raw: z.infer<typeof recordExpenseInput>
): Promise<{ ok: true; expenseId: string } | { ok: false; message: string }> {
  try {
    const input = recordExpenseInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const categoryKey = input.category.trim().toLowerCase();
    const accountCode =
      EXPENSE_ACCOUNT_MAP[categoryKey] ?? EXPENSE_ACCOUNT_MAP.misc;

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
        expense_date:
          input.expenseDate ?? new Date().toISOString().slice(0, 10),
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
      entryDate: input.expenseDate,
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
