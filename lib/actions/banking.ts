"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  defaultPosMethodForAccountType,
  type PaymentAccountType,
} from "@/lib/constants/payment-accounts";
import { buildCashToBankJournalLines } from "@/lib/accounting/posting-rules";
import { postJournalEntry } from "@/lib/actions/accounting";
import { CASH_DRAWER_DEPOSIT_PREFIX } from "@/lib/constants/cash-deposit";
import { requireOrgContext } from "@/lib/server/org-context";
import { requireManagerContext } from "@/lib/server/require-manager";
import { verifyManagerPassword } from "@/lib/auth/verify-manager-password";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { roundMoney } from "@/lib/utils/calculations";
import { resolveBusinessDate } from "@/lib/utils/iso-date";

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
  outlet_id: string | null;
  created_at: string;
};

/** Build a JSON-safe plain object (Supabase rows can have non-serializable prototypes). */
function mapAccountRow(r: {
  id: unknown;
  name: unknown;
  account_no?: unknown;
  bank_name?: unknown;
  currency?: unknown;
  current_balance?: unknown;
  is_active?: unknown;
  account_type?: unknown;
  lipa_merchant?: unknown;
  pos_payment_method?: unknown;
  show_in_pos?: unknown;
}): PaymentAccountRow {
  const accountType = (r.account_type as PaymentAccountType) ?? "bank";
  const posMethod = r.pos_payment_method as
    | PaymentAccountRow["pos_payment_method"]
    | null
    | undefined;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    account_type: accountType,
    account_no: r.account_no != null ? String(r.account_no) : null,
    bank_name: r.bank_name != null ? String(r.bank_name) : null,
    lipa_merchant: r.lipa_merchant != null ? String(r.lipa_merchant) : null,
    pos_payment_method: posMethod ?? defaultPosMethodForAccountType(accountType),
    show_in_pos: r.show_in_pos !== false,
    currency: r.currency != null ? String(r.currency) : "TZS",
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
      return (legacy ?? []).map((r: {
        id: string;
        name: string;
        account_no: string | null;
        bank_name: string | null;
        currency: string;
        current_balance: number;
        is_active: boolean;
      }) =>
        mapAccountRow({
          id: r.id,
          name: r.name,
          account_no: r.account_no,
          bank_name: r.bank_name,
          currency: r.currency,
          current_balance: r.current_balance,
          is_active: r.is_active,
          account_type: "bank",
        })
      );
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((r: Parameters<typeof mapAccountRow>[0]) =>
    mapAccountRow(r)
  );
}

export async function listBankAccounts(): Promise<PaymentAccountRow[]> {
  const all = await listPaymentAccounts();
  return all.filter((a) => a.is_active);
}

/** All active bank accounts for POS cash-to-bank deposits (not limited to Show on POS). */
export async function listCashDepositAccounts(): Promise<PaymentAccountRow[]> {
  const accounts = await listBankAccounts();
  return accounts
    .filter(
      (a) => a.account_type === "bank" || a.pos_payment_method === "bank_transfer"
    )
    .sort((a, b) => a.name.localeCompare(b.name));
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
  limit = 80,
  outletId?: string | null
): Promise<BankTransactionRow[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const accounts = await listPaymentAccounts();
  const nameById: Record<string, string> = {};
  for (const a of accounts) {
    nameById[a.id] = a.name;
  }

  let q = bankDb(supabase)
    .from("bank_transactions")
    .select(
      "id, bank_account_id, outlet_id, transaction_type, amount, reference_no, description, is_reconciled, transaction_date, created_at"
    )
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (accountId) q = q.eq("bank_account_id", accountId);
  if (outletId) q = q.eq("outlet_id", outletId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r: {
    id: string;
    bank_account_id: string | null;
    outlet_id?: string | null;
    transaction_type: string;
    amount: number;
    reference_no: string | null;
    description: string | null;
    is_reconciled: boolean;
    transaction_date: string | null;
    created_at: string;
  }) => {
    const accId =
      r.bank_account_id != null ? String(r.bank_account_id) : null;
    return {
      id: String(r.id),
      bank_account_id: accId,
      account_name: accId ? (nameById[accId] ?? "—") : "—",
      transaction_type: String(r.transaction_type ?? ""),
      amount: Number(r.amount ?? 0),
      reference_no: r.reference_no != null ? String(r.reference_no) : null,
      description: r.description != null ? String(r.description) : null,
      is_reconciled: Boolean(r.is_reconciled),
      transaction_date:
        r.transaction_date != null ? String(r.transaction_date) : null,
      outlet_id: r.outlet_id != null ? String(r.outlet_id) : null,
      created_at: String(r.created_at ?? ""),
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
  /** Supplier/AP withdrawals may exceed recorded balance until reconciled. */
  allowNegativeBalance: z.boolean().optional(),
});

/** Active collection accounts for outbound supplier payments (not limited to POS picker). */
export async function listOutboundPaymentAccounts(
  paymentMethod: "mpesa" | "bank_transfer" | "cheque"
): Promise<PaymentAccountRow[]> {
  const all = await listBankAccounts();
  if (paymentMethod === "bank_transfer" || paymentMethod === "cheque") {
    return all.filter((a) => a.account_type === "bank");
  }
  return all.filter(
    (a) =>
      a.account_type === "mpesa" ||
      a.account_type === "lipa" ||
      a.account_type === "till"
  );
}

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
    if (newBalance < 0 && !input.allowNegativeBalance) {
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

const cashDepositInput = z.object({
  bankAccountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  outletId: z.string().uuid(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional(),
  referenceNo: z.string().max(100).optional(),
});

/** Record cash moved from drawer to a bank/collection account (Dr Bank · Cr Cash). */
export async function recordCashToBankDeposit(
  raw: z.infer<typeof cashDepositInput>
): Promise<
  { ok: true; transactionId: string } | { ok: false; message: string }
> {
  try {
    const input = cashDepositInput.parse(raw);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();
    const businessDate = resolveBusinessDate(input.businessDate);
    const amount = roundMoney(input.amount);

    const { data: outlet } = await supabase
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!outlet) {
      return { ok: false, message: "Invalid outlet for your organization." };
    }

    const { data: account } = await bankDb(supabase)
      .from("bank_accounts")
      .select("id, current_balance, name")
      .eq("id", input.bankAccountId)
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true)
      .maybeSingle();
    if (!account) {
      return { ok: false, message: "Bank account not found." };
    }

    const note = input.description?.trim();
    const description = note
      ? `${CASH_DRAWER_DEPOSIT_PREFIX} · ${note}`
      : CASH_DRAWER_DEPOSIT_PREFIX;

    const { data: txn, error: txErr } = await bankDb(supabase)
      .from("bank_transactions")
      .insert({
        organization_id: ctx.organizationId,
        bank_account_id: input.bankAccountId,
        outlet_id: input.outletId,
        transaction_type: "deposit",
        amount,
        reference_no: input.referenceNo?.trim() || null,
        description,
        transaction_date: businessDate,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (txErr || !txn) {
      return { ok: false, message: txErr?.message ?? "Could not record deposit." };
    }

    const newBalance = roundMoney(Number(account.current_balance) + amount);
    const { error: balErr } = await bankDb(supabase)
      .from("bank_accounts")
      .update({ current_balance: newBalance })
      .eq("id", input.bankAccountId);
    if (balErr) {
      await bankDb(supabase).from("bank_transactions").delete().eq("id", txn.id);
      return { ok: false, message: balErr.message };
    }

    const journal = await postJournalEntry({
      description: `${description} → ${account.name}`,
      sourceType: "transfer",
      sourceId: txn.id,
      outletId: input.outletId,
      entryDate: businessDate,
      lines: buildCashToBankJournalLines(amount),
    });
    if (!journal.ok) {
      await bankDb(supabase)
        .from("bank_accounts")
        .update({ current_balance: Number(account.current_balance) })
        .eq("id", input.bankAccountId);
      await bankDb(supabase).from("bank_transactions").delete().eq("id", txn.id);
      return { ok: false, message: journal.message };
    }

    revalidatePath("/finance/banking");
    revalidatePath("/pos");
    revalidatePath("/daily-closing");
    return { ok: true, transactionId: txn.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Cash deposit failed",
    };
  }
}

/** Credit a collection account when a POS sale or customer payment is received. */
export async function creditAccountFromPosSale(
  paymentAccountId: string,
  amount: number,
  saleId: string,
  invoiceNo: string,
  businessDate?: string,
  description?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (amount <= 0) return { ok: true };
  return recordBankTransaction({
    bankAccountId: paymentAccountId,
    transactionType: "deposit",
    amount: roundMoney(amount),
    referenceNo: invoiceNo,
    description: description ?? `POS sale ${invoiceNo}`,
    transactionDate: businessDate,
  });
}

/** Debit a collection account for purchases, expenses, or supplier payments. */
export async function withdrawFromCollectionAccount(
  bankAccountId: string,
  amount: number,
  description: string,
  options?: { referenceNo?: string; transactionDate?: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (amount <= 0) return { ok: true };
  return recordBankTransaction({
    bankAccountId,
    transactionType: "withdrawal",
    amount: roundMoney(amount),
    referenceNo: options?.referenceNo,
    description,
    transactionDate: options?.transactionDate,
    allowNegativeBalance: true,
  });
}

/** Credit a collection account when a refund is received (e.g. supplier return). */
export async function depositToCollectionAccount(
  bankAccountId: string,
  amount: number,
  description: string,
  options?: { referenceNo?: string; transactionDate?: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (amount <= 0) return { ok: true };
  return recordBankTransaction({
    bankAccountId,
    transactionType: "deposit",
    amount: roundMoney(amount),
    referenceNo: options?.referenceNo,
    description,
    transactionDate: options?.transactionDate,
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

const adjustBalanceInput = z.object({
  bankAccountId: z.string().uuid(),
  newBalance: z.number().nonnegative(),
  reason: z.string().min(3).max(500),
  adminPassword: z.string().min(6),
});

/** Set account balance to an exact figure (owner/manager + password). */
export async function adjustPaymentAccountBalance(
  raw: z.infer<typeof adjustBalanceInput>
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const input = adjustBalanceInput.parse(raw);
    const verified = await verifyManagerPassword(input.adminPassword);
    if (!verified.ok) return verified;

    const { organizationId, userId } = await requireManagerContext();
    const supabase = await createServerSupabaseClient();

    const { data: account } = await bankDb(supabase)
      .from("bank_accounts")
      .select("id, name, current_balance, account_type")
      .eq("id", input.bankAccountId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (!account) {
      return { ok: false, message: "Account not found." };
    }

    const previous = roundMoney(Number(account.current_balance));
    const target = roundMoney(input.newBalance);
    const delta = roundMoney(target - previous);

    if (delta === 0) {
      return { ok: false, message: "New balance matches the current balance." };
    }

    const txnType = delta > 0 ? "deposit" : "withdrawal";
    const amount = Math.abs(delta);
    const reason = input.reason.trim();
    const label = `Balance adjustment: ${reason}`;

    const { error: txErr } = await bankDb(supabase)
      .from("bank_transactions")
      .insert({
        organization_id: organizationId,
        bank_account_id: input.bankAccountId,
        transaction_type: txnType,
        amount,
        reference_no: `ADJ-${Date.now()}`,
        description: label,
        transaction_date: new Date().toISOString().slice(0, 10),
        created_by: userId,
        is_reconciled: true,
      });
    if (txErr) return { ok: false, message: txErr.message };

    const { error: balErr } = await bankDb(supabase)
      .from("bank_accounts")
      .update({ current_balance: target })
      .eq("id", input.bankAccountId);
    if (balErr) return { ok: false, message: balErr.message };

    revalidatePath("/finance/banking");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Balance adjustment failed",
    };
  }
}
