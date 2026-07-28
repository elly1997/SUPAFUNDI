import { isCustomerDepositRef } from "@/lib/constants/party-payments";
import { roundMoney } from "@/lib/utils/calculations";

export type CustomerDepositLedgerRow = {
  id: string;
  /** YYYY-MM-DD business date */
  date: string;
  type: "received" | "applied";
  label: string;
  reference: string;
  payment_method: string | null;
  /** Money in (deposit received) */
  amount_in: number;
  /** Money out (applied to invoice / prior credit) */
  amount_out: number;
  /** Running prepaid balance after this line */
  balance: number;
};

type DepositReceipt = {
  id: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  payment_date: string | null;
  created_at: string;
};

type DepositAppliedSale = {
  id: string;
  invoice_no: string;
  sale_date: string;
  deposit_applied: number;
};

/** Legacy: deposit cash paid AR without sales.deposit_applied. */
type DepositToCreditEntry = {
  id: string;
  amount: number;
  entry_date: string;
  description: string | null;
};

export function paymentDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
}

export function buildCustomerDepositLedger(
  receipts: DepositReceipt[],
  appliedSales: DepositAppliedSale[],
  depositToCredit: DepositToCreditEntry[] = []
): CustomerDepositLedgerRow[] {
  type Raw = {
    id: string;
    date: string;
    sortAt: string;
    type: "received" | "applied";
    label: string;
    reference: string;
    payment_method: string | null;
    amount_in: number;
    amount_out: number;
  };

  const raw: Raw[] = [];

  for (const d of receipts) {
    const ref = String(d.reference_no ?? "");
    if (!isCustomerDepositRef(ref)) continue;
    const amount = roundMoney(Number(d.amount));
    if (amount <= 0) continue;
    const date = paymentDateOnly(String(d.payment_date ?? d.created_at));
    raw.push({
      id: `dep-${d.id}`,
      date,
      sortAt: String(d.payment_date ?? d.created_at),
      type: "received",
      label: "Deposit received",
      reference: ref,
      payment_method: String(d.payment_method),
      amount_in: amount,
      amount_out: 0,
    });
  }

  for (const s of appliedSales) {
    const amount = roundMoney(Number(s.deposit_applied ?? 0));
    if (amount <= 0) continue;
    const date = paymentDateOnly(String(s.sale_date));
    raw.push({
      id: `sale-dep-${s.id}`,
      date,
      sortAt: String(s.sale_date),
      type: "applied",
      label: "Applied to invoice",
      reference: String(s.invoice_no),
      payment_method: "deposit",
      amount_in: 0,
      amount_out: amount,
    });
  }

  for (const e of depositToCredit) {
    const amount = roundMoney(Number(e.amount));
    if (amount <= 0) continue;
    const date = paymentDateOnly(String(e.entry_date));
    raw.push({
      id: `dep-ar-${e.id}`,
      date,
      sortAt: `${e.entry_date}T00:00:00.000Z`,
      type: "applied",
      label: "Applied to prior credit",
      reference: e.description?.trim() || "Credit paydown",
      payment_method: "deposit",
      amount_in: 0,
      amount_out: amount,
    });
  }

  raw.sort(
    (a, b) =>
      a.sortAt.localeCompare(b.sortAt) ||
      (a.type === "received" ? -1 : 1)
  );

  let running = 0;
  const withBalance: CustomerDepositLedgerRow[] = [];
  for (const row of raw) {
    running = roundMoney(running + row.amount_in - row.amount_out);
    withBalance.push({
      id: row.id,
      date: row.date,
      type: row.type,
      label: row.label,
      reference: row.reference,
      payment_method: row.payment_method,
      amount_in: row.amount_in,
      amount_out: row.amount_out,
      balance: running,
    });
  }

  return withBalance.reverse();
}

export function summarizeDepositLedger(rows: CustomerDepositLedgerRow[]): {
  total_received: number;
  total_applied: number;
  balance: number;
} {
  const total_received = roundMoney(
    rows.reduce((s, r) => s + r.amount_in, 0)
  );
  const total_applied = roundMoney(
    rows.reduce((s, r) => s + r.amount_out, 0)
  );
  const balance = roundMoney(total_received - total_applied);
  return { total_received, total_applied, balance };
}

/**
 * Reconstruct prepaid from ledger inputs (for repair). Prefer live
 * customers.deposit_balance after recording is fixed.
 */
export function computeDepositBalanceFromParts(parts: {
  receiptsTotal: number;
  appliedToInvoices: number;
  appliedToPriorCredit: number;
}): number {
  return roundMoney(
    Math.max(
      0,
      parts.receiptsTotal -
        parts.appliedToInvoices -
        parts.appliedToPriorCredit
    )
  );
}
