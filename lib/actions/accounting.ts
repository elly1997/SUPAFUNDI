"use server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { DEFAULT_HARDWARE_COA } from "@/lib/accounting/coa-template";
import {
  assertBalanced,
  type JournalLineInput,
} from "@/lib/accounting/posting-rules";
import { requireOrgContext } from "@/lib/server/org-context";

/** Seed default chart of accounts + VAT code for a new organization (service role). */
export async function seedAccountingForOrganization(
  organizationId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const admin = createAdminSupabaseClient();

    const { count } = await admin
      .from("chart_of_accounts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    if (count && count > 0) {
      return { ok: true };
    }

    const rows = DEFAULT_HARDWARE_COA.map((a) => ({
      organization_id: organizationId,
      code: a.code,
      name: a.name,
      account_type: a.account_type,
      account_subtype: a.account_subtype ?? null,
      normal_balance: a.normal_balance,
      is_system: a.is_system,
      is_active: true,
    }));

    const { error: coaError } = await admin.from("chart_of_accounts").insert(rows);
    if (coaError) {
      return { ok: false, message: coaError.message };
    }

    const { error: taxError } = await admin.from("tax_codes").insert({
      organization_id: organizationId,
      code: "VAT18",
      name: "VAT 18%",
      rate: 18,
      applies_to: "both",
      is_active: true,
    });
    if (taxError) {
      return { ok: false, message: taxError.message };
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { error: periodError } = await admin.from("fiscal_periods").insert({
      organization_id: organizationId,
      name: periodStart.toLocaleString("en", { month: "long", year: "numeric" }),
      period_start: periodStart.toISOString().slice(0, 10),
      period_end: periodEnd.toISOString().slice(0, 10),
      status: "open",
    });
    if (periodError) {
      return { ok: false, message: periodError.message };
    }

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Accounting seed failed",
    };
  }
}

type PostJournalParams = {
  description: string;
  sourceType:
    | "sale"
    | "sale_return"
    | "payment"
    | "grn"
    | "expense"
    | "supplier_bill"
    | "supplier_payment"
    | "stock_adjustment"
    | "manual";
  sourceId?: string;
  outletId?: string;
  entryDate?: string;
  lines: JournalLineInput[];
};

/** Post a balanced journal entry to the general ledger. */
export async function postJournalEntry(
  params: PostJournalParams
): Promise<{ ok: true; journalEntryId: string } | { ok: false; message: string }> {
  try {
    assertBalanced(params.lines);
    const ctx = await requireOrgContext();
    const supabase = await createServerSupabaseClient();

    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, code")
      .eq("organization_id", ctx.organizationId)
      .eq("is_active", true);
    if (!accounts?.length) {
      return {
        ok: false,
        message: "Chart of accounts not initialized. Re-run organization setup or contact support.",
      };
    }
    const codeToId = new Map(accounts.map((a) => [a.code, a.id]));

    const entryNo = `JE-${Date.now().toString(36).toUpperCase()}`;
    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        organization_id: ctx.organizationId,
        outlet_id: params.outletId ?? ctx.outletId,
        entry_no: entryNo,
        entry_date: params.entryDate ?? new Date().toISOString().slice(0, 10),
        description: params.description,
        source_type: params.sourceType,
        source_id: params.sourceId ?? null,
        created_by: ctx.userId,
        is_posted: true,
      })
      .select("id")
      .single();
    if (entryError || !entry) {
      return { ok: false, message: entryError?.message ?? "Journal insert failed" };
    }

    const lineRows = params.lines.map((l) => {
      const accountId = codeToId.get(l.accountCode);
      if (!accountId) {
        throw new Error(`Unknown account code: ${l.accountCode}`);
      }
      return {
        journal_entry_id: entry.id,
        account_id: accountId,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo ?? null,
      };
    });

    const { error: linesError } = await supabase
      .from("journal_entry_lines")
      .insert(lineRows);
    if (linesError) {
      return { ok: false, message: linesError.message };
    }

    return { ok: true, journalEntryId: entry.id };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Post journal failed",
    };
  }
}

export async function listChartOfAccounts(): Promise<
  { code: string; name: string; account_type: string; normal_balance: string }[]
> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("code, name, account_type, normal_balance")
    .eq("organization_id", ctx.organizationId)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return data ?? [];
}
