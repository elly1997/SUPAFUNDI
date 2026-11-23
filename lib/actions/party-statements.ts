"use server";

import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCustomerDepositRef } from "@/lib/constants/party-payments";
import { paymentDateOnly } from "@/lib/finance/customer-deposit-ledger";
import { roundMoney } from "@/lib/utils/calculations";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function apDb(supabase: Supabase) {
  return supabase as unknown as {
    from: (table: string) => ReturnType<Supabase["from"]>;
  };
}

export type PartyStatementLine = {
  id: string;
  date: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  payment_method: string | null;
  /** + received / − applied against invoices */
  deposit_delta?: number;
  deposit_balance?: number;
};

export async function getSupplierStatement(
  supplierId: string,
  limit = 2000
): Promise<PartyStatementLine[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const outletId = ctx.outletId;

  let billsQuery = apDb(supabase)
    .from("supplier_bills")
    .select(
      "id, bill_no, bill_date, total_amount, amount_paid, status, created_at, notes"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("supplier_id", supplierId)
    .order("bill_date", { ascending: false })
    .limit(limit);
  if (outletId) billsQuery = billsQuery.eq("outlet_id", outletId);
  const { data: bills } = await billsQuery;

  let paymentsQuery = apDb(supabase)
    .from("supplier_payments")
    .select(
      "id, amount, payment_method, reference_no, payment_date, created_at, bill_id"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("supplier_id", supplierId)
    .order("payment_date", { ascending: false })
    .limit(limit);
  if (outletId) paymentsQuery = paymentsQuery.eq("outlet_id", outletId);
  const { data: payments } = await paymentsQuery;

  type Raw = {
    id: string;
    date: string;
    type: string;
    reference: string;
    debit: number;
    credit: number;
    payment_method: string | null;
  };

  const raw: Raw[] = [];

  /**
   * Supplier AP convention (what we owe):
   * - Credit = purchases / bills (increases balance)
   * - Debit = payments / returns / credit memos (decreases balance)
   * - Balance = credit − debit
   */
  for (const b of bills ?? []) {
    const total = Number(b.total_amount);
    const date = String(b.bill_date ?? b.created_at).slice(0, 10);
    if (total < 0) {
      raw.push({
        id: `bill-${b.id}`,
        date,
        type: "Credit memo",
        reference: String(b.bill_no),
        debit: Math.abs(total),
        credit: 0,
        payment_method: null,
      });
      continue;
    }
    raw.push({
      id: `bill-${b.id}`,
      date,
      type: "Bill",
      reference: String(b.bill_no),
      debit: 0,
      credit: total,
      payment_method: null,
    });
  }

  for (const p of payments ?? []) {
    const amt = Number(p.amount);
    const method = String(p.payment_method ?? "");
    const isReturn =
      method === "return" ||
      method === "supplier_return" ||
      method === "credit_note";
    raw.push({
      id: `pay-${p.id}`,
      date: String(p.payment_date ?? p.created_at).slice(0, 10),
      type: isReturn ? "Return credit" : "Payment",
      reference: String(p.reference_no ?? p.bill_id?.slice(0, 8) ?? "—"),
      debit: amt,
      credit: 0,
      payment_method: method || null,
    });
  }

  raw.sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));

  let running = 0;
  const chronological = [...raw].reverse();
  const withBalance: PartyStatementLine[] = [];
  for (const row of chronological) {
    running = roundMoney(running + row.credit - row.debit);
    withBalance.push({ ...row, balance: running });
  }

  return withBalance.reverse();
}

export async function getCustomerStatement(
  customerId: string,
  limit = 2000
): Promise<PartyStatementLine[]> {
  const { syncCustomerDeposits } = await import("@/lib/actions/credit");
  await syncCustomerDeposits(customerId);

  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: ledger } = await apDb(supabase)
    .from("credit_ledger")
    .select(
      "id, entry_type, debit, credit, balance, description, entry_date, created_at, reference_type"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .order("entry_date", { ascending: false })
    .limit(limit);

  const { data: sales } = await supabase
    .from("sales")
    .select(
      "id, invoice_no, sale_date, total_amount, amount_paid, balance_due, deposit_applied, status"
    )
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .eq("status", "completed")
    .order("sale_date", { ascending: false })
    .limit(limit);

  const saleIds = (sales ?? []).map((s) => s.id);
  const { data: salePayments } =
    saleIds.length > 0
      ? await supabase
          .from("payments")
          .select(
            "id, sale_id, amount, payment_method, reference_no, payment_date, created_at"
          )
          .eq("organization_id", ctx.organizationId)
          .in("sale_id", saleIds)
          .eq("status", "completed")
          .order("payment_date", { ascending: false })
          .limit(limit)
      : { data: [] as const };

  type Raw = {
    id: string;
    date: string;
    type: string;
    reference: string;
    debit: number;
    credit: number;
    payment_method: string | null;
    deposit_delta: number;
  };

  const raw: Raw[] = [];

  for (const s of sales ?? []) {
    const due = Number(s.balance_due);
    const total = Number(s.total_amount);
    const depositApplied = Number(s.deposit_applied ?? 0);
    if (total <= 0) continue;

    raw.push({
      id: `sale-${s.id}`,
      date: paymentDateOnly(String(s.sale_date)),
      type: due > 0 ? "Invoice (credit)" : "Invoice (paid)",
      reference: String(s.invoice_no),
      debit: total,
      credit: 0,
      payment_method: null,
      deposit_delta: 0,
    });

    if (depositApplied > 0) {
      raw.push({
        id: `sale-dep-${s.id}`,
        date: paymentDateOnly(String(s.sale_date)),
        type: "Deposit applied to invoice",
        reference: String(s.invoice_no),
        debit: 0,
        credit: depositApplied,
        payment_method: "deposit",
        deposit_delta: -depositApplied,
      });
    }
  }

  for (const p of salePayments ?? []) {
    const ref = String(p.reference_no ?? "");
    if (isCustomerDepositRef(ref)) continue;
    raw.push({
      id: `sale-pay-${p.id}`,
      date: paymentDateOnly(String(p.payment_date ?? p.created_at)),
      type: "Payment (sale)",
      reference: ref || "—",
      debit: 0,
      credit: Number(p.amount),
      payment_method: String(p.payment_method),
      deposit_delta: 0,
    });
  }

  for (const e of ledger ?? []) {
    const debit = Number(e.debit);
    const credit = Number(e.credit);
    const refType = String(e.reference_type ?? "");
    // Already represented by sales / payments / deposit rows — skip to avoid double-count.
    if (
      (e.entry_type === "invoice" && refType === "sale") ||
      refType === "deposit_applied" ||
      refType === "deposit_to_credit" ||
      refType === "cash_to_credit" ||
      refType === "customer_payment" ||
      refType === "sale_void"
    ) {
      continue;
    }
    // Void restores prepaid deposit — track deposit only, not AR debit/credit.
    if (refType === "deposit_restore_void") {
      raw.push({
        id: `led-${e.id}`,
        date: paymentDateOnly(String(e.entry_date ?? e.created_at)),
        type: "Deposit restored (void)",
        reference: String(e.description ?? "—").slice(0, 60),
        debit: 0,
        credit: 0,
        payment_method: null,
        deposit_delta: debit > 0 ? debit : credit,
      });
      continue;
    }
    raw.push({
      id: `led-${e.id}`,
      date: paymentDateOnly(String(e.entry_date ?? e.created_at)),
      type:
        e.entry_type === "payment"
          ? "Payment (credit)"
          : e.entry_type === "invoice"
            ? "Credit sale"
            : String(e.entry_type),
      reference: String(e.description ?? "—").slice(0, 60),
      debit,
      credit,
      payment_method: null,
      deposit_delta: 0,
    });
  }

  const { data: depositReceipts } = await supabase
    .from("payments")
    .select("id, amount, payment_method, reference_no, payment_date, created_at")
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .is("sale_id", null)
    .order("payment_date", { ascending: false })
    .limit(50);

  for (const d of depositReceipts ?? []) {
    const ref = String(d.reference_no ?? "");
    if (!isCustomerDepositRef(ref)) continue;
    const amount = roundMoney(Number(d.amount));
    raw.push({
      id: `dep-${d.id}`,
      date: paymentDateOnly(String(d.payment_date ?? d.created_at)),
      type: "Deposit received",
      reference: ref,
      debit: 0,
      credit: 0,
      payment_method: String(d.payment_method),
      deposit_delta: amount,
    });
  }

  raw.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

  let running = 0;
  let depositRunning = 0;
  let depositActivity = false;
  const chronological = [...raw].reverse();
  const withBalance: PartyStatementLine[] = [];
  for (const row of chronological) {
    running = roundMoney(running + row.debit - row.credit);
    if (row.deposit_delta !== 0) {
      depositActivity = true;
      depositRunning = roundMoney(depositRunning + row.deposit_delta);
    }
    withBalance.push({
      ...row,
      balance: running,
      deposit_delta: row.deposit_delta !== 0 ? row.deposit_delta : undefined,
      deposit_balance: depositActivity ? depositRunning : undefined,
    });
  }

  return withBalance.reverse();
}

export type CustomerOpenInvoice = {
  saleId: string;
  invoiceNo: string;
  saleDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
};

export async function listCustomerOpenInvoices(
  customerId: string
): Promise<CustomerOpenInvoice[]> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, invoice_no, sale_date, total_amount, amount_paid, balance_due")
    .eq("organization_id", ctx.organizationId)
    .eq("customer_id", customerId)
    .eq("status", "completed")
    .gt("balance_due", 0)
    .order("sale_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    saleId: s.id,
    invoiceNo: s.invoice_no,
    saleDate: s.sale_date,
    totalAmount: Number(s.total_amount),
    amountPaid: Number(s.amount_paid),
    balanceDue: Number(s.balance_due),
  }));
}
