"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  defaultPosMethodForAccountType,
  type PaymentAccountType,
} from "@/lib/constants/payment-accounts";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function bankDb(supabase: SupabaseClient) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<SupabaseClient["from"]>;
  };
}

export type PaymentAccountRow = {
  id: string;
  name: string;
  account_type: PaymentAccountType;
  account_no: string | null;
  bank_name: string | null;
  lipa_merchant: string | null;
  pos_payment_method: "mpesa" | "bank_transfer" | "card" | null;
  show_in_pos: boolean;
  currency: string;
  current_balance: number;
  is_active: boolean;
};

/** @deprecated alias */
export type BankAccountRow = PaymentAccountRow;

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

function mapAccountRow(r: Record<string, unknown>): PaymentAccountRow {
  const accountType = (r.account_type as PaymentAccountType) ?? "bank";
  return {
    id: r.id as string,
    name: r.name as string,
    account_type: accountType,
    account_no: (r.account_no as string | null) ?? null,
    bank_name: (r.bank_name as string | null) ?? null,
    lipa_merchant: (r.lipa_merchant as string | null) ?? null,
    pos_payment_method:
      (r.pos_payment_method as PaymentAccountRow["pos_payment_method"]) ??
      defaultPosMethodForAccountType(accountType),
    show_in_pos: r.show_in_pos !== false,
    currency: (r.currency as string) ?? "TZS",
    current_balance: Number(r.current_balance ?? 0),
    is_active: r.is_active !== false,
  };
}

export async function listPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await bankDb(supabase)
    .from("bank_accounts")
    .select(
      "id, name, account_no, bank_name, currency, current_balance, is_active, account_type, lipa_merchant, pos_payment_method, show_in_pos"
    )
    .eq("organization_id", ctx.organizationId)
    .order("name");
  if (error) {
    if (
      error.message.includes("account_type") ||
      error.message.includes("does not exist")
    ) {
      const { data: legacy, error: legErr } = await bankDb(supabase)
        .from("bank_accounts")
        .select(
          "id, name, account_no, bank_name, currency, current_balance, is_active"
        )
        .eq("organization_id", ctx.organizationId)
        .order("name");
      if (legErr) throw new Error(legErr.message);
      return (legacy ?? []).map((r: Record<string, unknown>) =>
        mapAccountRow({ ...r, account_type: "bank" })
      );
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((r: Record<string, unknown>) => mapAccountRow(r));
}

export async function listBankAccounts(): Promise<PaymentAccountRow[]> {
  const all = await listPaymentAccounts();
  return all.filter((a) => a.is_active);
}

/** Accounts offered on POS when collecting M-Pesa / bank / card. */
export async function listPosPaymentAccounts(
  posMethod: "mpesa" | "bank_transfer" | "card"
): Promise<PaymentAccountRow[]> {
  const accounts = await listBankAccounts();
  return accounts.filter(
    (a) =>
      a.show_in_pos &&
      (a.pos_payment_method === posMethod ||
        (posMethod === "mpesa" &&
          (a.account_type === "mpesa" ||
            a.account_type === "lipa" ||
            a.account_type === "till")) ||
        (posMethod === "bank_transfer" && a.account_type === "bank"))
  );
}

export async function listBankTransactions(
  accountId?: string | null,
  limit = 80
): Promise<BankTransactionRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const accounts = await listPaymentAccounts();
  const nameMap = new Map(accounts.map((a) => [a.id, a.name]));

  let q = bankDb(supabase)
    .from("bank_transactions")
    .select(
      "id, bank_account_id, transaction_type, amount, reference_no, description, is_reconciled, transaction_date, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (accountId) q = q.eq("bank_account_id", accountId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row;
    const accId = r.bank_account_id as string | null;
    return {
      id: r.id as string,
      bank_account_id: accId,
      account_name: accId ? (nameMap.get(accId) ?? "—") : "—",
      transaction_type: r.transaction_type as string,
      amount: Number(r.amount),
      reference_no: r.reference_no as string | null,
      description: r.description as string | null,
      is_reconciled: Boolean(r.is_reconciled),
      transaction_date: r.transaction_date as string | null,
      created_at: r.created_at as string,
    };
  });
}

const accountInput = z.object({
  name: z.string().min(1).max(120),
  accountType: z.enum(["bank", "mpesa", "lipa", "till"]).default("bank"),
  bankName: z.string().max(120).optional(),
  accountNo: z.string().max(80).optional(),
  lipaMerchant: z.string().max(120).optional(),
  posPaymentMethod: z.enum(["mpesa", "bank_transfer", "card"]).optional(),
  showInPos: z.boolean().default(true),
  openingBalance: z.number().nonnegative().default(0),
});

export async function createPaymentAccount(
  raw: z.infer<typeof accountInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const input = accountInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const posMethod =
      input.posPaymentMethod ??
      defaultPosMethodForAccountType(input.accountType);

    const insertPayload: Record<string, unknown> = {
      organization_id: ctx.organizationId,
      name: input.name.trim(),
      bank_name: input.bankName?.trim() || null,
      account_no: input.accountNo?.trim() || null,
      current_balance: input.openingBalance,
      is_active: true,
    };

    const extended = {
      ...insertPayload,
      account_type: input.accountType,
      lipa_merchant: input.lipaMerchant?.trim() || null,
      pos_payment_method: posMethod,
      show_in_pos: input.showInPos,
    };

    let { data, error } = await bankDb(supabase)
      .from("bank_accounts")
      .insert(extended)
      .select("id")
      .single();

    if (error?.message?.includes("account_type")) {
      ({ data, error } = await bankDb(supabase)
        .from("bank_accounts")
        .insert(insertPayload)
        .select("id")
        .single());
    }

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
    return { ok: true, id: data.id as string };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Create failed",
    };
  }
}

export async function createBankAccount(
  raw: z.infer<typeof accountInput>
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  return createPaymentAccount(raw);
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

/** Credit a collection account when a POS sale is paid to M-Pesa / bank / card. */
export async function creditAccountFromPosSale(
  paymentAccountId: string,
  amount: number,
  saleId: string,
  invoiceNo: string,
  businessDate?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (amount <= 0) return { ok: true };
  return recordBankTransaction({
    bankAccountId: paymentAccountId,
    transactionType: "deposit",
    amount: roundMoney(amount),
    referenceNo: invoiceNo,
    description: `POS sale ${invoiceNo}`,
    transactionDate: businessDate,
  });
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
