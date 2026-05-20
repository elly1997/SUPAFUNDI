"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function bankDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}

export type BankAccountRow = {
  id: string;
  name: string;
  account_no: string | null;
  bank_name: string | null;
  currency: string;
  current_balance: number;
  is_active: boolean;
};

export type BankTransactionRow = {
  id: string;
  bank_account_id: string | null;
  account_name: string;
  transaction_type: string;
  amount: number;
  reference_no: string | null;
  description: string | null;
  is_reconciled: boolean;
  transaction_date: string | null;
  created_at: string;
};

export async function listBankAccounts(): Promise<BankAccountRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await bankDb(supabase)
    .from("bank_accounts")
    .select("id, name, account_no, bank_name, currency, current_balance, is_active")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    account_no: (r.account_no as string | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    currency: (r.currency as string) ?? "TZS",
    current_balance: Number(r.current_balance),
    is_active: Boolean(r.is_active),
  }));
}

export async function listBankTransactions(
  accountId?: string | null,
  limit = 80
): Promise<BankTransactionRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  let q = bankDb(supabase)
    .from("bank_transactions")
    .select(
      "id, bank_account_id, transaction_type, amount, reference_no, description, is_reconciled, transaction_date, created_at, bank_accounts(name)"
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (accountId) q = q.eq("bank_account_id", accountId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type TxRow = {
    id: string;
    bank_account_id: string | null;
    transaction_type: string;
    amount: number;
    reference_no: string | null;
    description: string | null;
    is_reconciled: boolean;
    transaction_date: string | null;
    created_at: string;
    bank_accounts: { name: string } | null;
  };

  return ((data ?? []) as TxRow[]).map((row) => {
    const acc = row.bank_accounts;
    return {
      id: row.id as string,
      bank_account_id: row.bank_account_id as string | null,
      account_name: acc?.name ?? "—",
      transaction_type: row.transaction_type as string,
      amount: Number(row.amount),
      reference_no: row.reference_no as string | null,
      description: row.description as string | null,
      is_reconciled: Boolean(row.is_reconciled),
      transaction_date: row.transaction_date as string | null,
      created_at: row.created_at as string,
    };
  });
}

const accountInput = z.object({
  name: z.string().min(1).max(120),
  bankName: z.string().max(120).optional(),
  accountNo: z.string().max(80).optional(),
  openingBalance: z.number().nonnegative().default(0),
});

export async function createBankAccount(
  raw: z.infer<typeof accountInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = accountInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const { data, error } = await bankDb(supabase)
      .from("bank_accounts")
      .insert({
        organization_id: ctx.organizationId,
        name: input.name.trim(),
        bank_name: input.bankName?.trim() || null,
        account_no: input.accountNo?.trim() || null,
        current_balance: input.openingBalance,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Create failed" };
    }
    if (input.openingBalance > 0) {
      await bankDb(supabase).from("bank_transactions").insert({
        organization_id: ctx.organizationId,
        bank_account_id: data.id,
        transaction_type: "deposit",
        amount: input.openingBalance,
        description: "Opening balance",
        transaction_date: new Date().toISOString().slice(0, 10),
        created_by: ctx.userId,
      });
    }
    revalidatePath("/finance/banking");
    return { ok: true, id: data.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create failed",
    };
  }
}

const txnInput = z.object({
  bankAccountId: z.string().uuid(),
  transactionType: z.enum(["deposit", "withdrawal", "transfer"]),
  amount: z.number().positive(),
  referenceNo: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function recordBankTransaction(
  raw: z.infer<typeof txnInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = txnInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: account } = await bankDb(supabase)
      .from("bank_accounts")
      .select("id, current_balance")
      .eq("id", input.bankAccountId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!account) return { ok: false, message: "Account not found." };

    const delta =
      input.transactionType === "withdrawal"
        ? -input.amount
        : input.amount;
    const newBalance = roundMoney(Number(account.current_balance) + delta);
    if (newBalance < 0) {
      return { ok: false, message: "Insufficient account balance." };
    }

    const { error: txErr } = await bankDb(supabase)
      .from("bank_transactions")
      .insert({
        organization_id: ctx.organizationId,
        bank_account_id: input.bankAccountId,
        transaction_type: input.transactionType,
        amount: input.amount,
        reference_no: input.referenceNo?.trim() || null,
        description: input.description?.trim() || null,
        transaction_date:
          input.transactionDate ?? new Date().toISOString().slice(0, 10),
        created_by: ctx.userId,
      });
    if (txErr) return { ok: false, message: txErr.message };

    const { error: balErr } = await bankDb(supabase)
      .from("bank_accounts")
      .update({ current_balance: newBalance })
      .eq("id", input.bankAccountId);
    if (balErr) return { ok: false, message: balErr.message };

    revalidatePath("/finance/banking");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Transaction failed",
    };
  }
}

export async function toggleBankTransactionReconciled(
  transactionId: string,
  reconciled: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { error } = await bankDb(supabase)
    .from("bank_transactions")
    .update({ is_reconciled: reconciled })
    .eq("id", transactionId)
    .eq("organization_id", ctx.organizationId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/finance/banking");
  return { ok: true };
}
