/**
 * Double-entry posting rules (QuickBooks-aligned).
 * Each business event produces a balanced journal entry.
 *
 * Normal balances:
 * - Assets & COGS & Expenses: debit increases
 * - Liabilities, Equity, Income: credit increases
 */

import { SYSTEM_ACCOUNT_CODES } from "./coa-template";

export type JournalLineInput = {
  accountCode: string;
  debit: number;
  credit: number;
  memo?: string;
};

export type SalePostingInput = {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentMethod: "cash" | "mpesa" | "card" | "bank_transfer" | "credit_account" | "cheque" | "loyalty_points";
  cogsAmount: number;
};

/** Cash retail sale (simplified). Credit sales post to AR instead of cash/mpesa. */
export function buildSaleJournalLines(input: SalePostingInput): JournalLineInput[] {
  const netRevenue = input.subtotal - input.discountAmount;
  const lines: JournalLineInput[] = [];

  const cashAccount =
    input.paymentMethod === "mpesa"
      ? SYSTEM_ACCOUNT_CODES.mpesa
      : input.paymentMethod === "bank_transfer" || input.paymentMethod === "card"
        ? SYSTEM_ACCOUNT_CODES.bank
        : input.paymentMethod === "credit_account"
          ? SYSTEM_ACCOUNT_CODES.ar
          : SYSTEM_ACCOUNT_CODES.cash;

  const immediatePay = input.amountPaid;
  const onCredit = input.balanceDue;

  if (immediatePay > 0) {
    lines.push({
      accountCode: cashAccount,
      debit: immediatePay,
      credit: 0,
      memo: "Payment received",
    });
  }
  if (onCredit > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.ar,
      debit: onCredit,
      credit: 0,
      memo: "Credit sale — AR",
    });
  }

  if (netRevenue > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.salesRevenue,
      debit: 0,
      credit: netRevenue,
      memo: "Sales revenue",
    });
  }
  if (input.discountAmount > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.salesDiscount,
      debit: input.discountAmount,
      credit: 0,
      memo: "Sales discount",
    });
  }
  if (input.taxAmount > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.vatOutput,
      debit: 0,
      credit: input.taxAmount,
      memo: "VAT on sales",
    });
  }

  if (input.cogsAmount > 0) {
    lines.push(
      {
        accountCode: SYSTEM_ACCOUNT_CODES.cogs,
        debit: input.cogsAmount,
        credit: 0,
        memo: "COGS",
      },
      {
        accountCode: SYSTEM_ACCOUNT_CODES.inventory,
        debit: 0,
        credit: input.cogsAmount,
        memo: "Inventory relief",
      }
    );
  }

  return lines;
}

export type PurchasePaymentMethod =
  | "cash"
  | "mpesa"
  | "bank_transfer"
  | "on_account";

export type GrnPostingInput = {
  inventoryValue: number;
  taxAmount: number;
  /** @deprecated use paymentMethod */
  onAccount?: boolean;
  paymentMethod?: PurchasePaymentMethod;
};

function purchaseCreditAccount(method: PurchasePaymentMethod): string {
  switch (method) {
    case "mpesa":
      return SYSTEM_ACCOUNT_CODES.mpesa;
    case "bank_transfer":
      return SYSTEM_ACCOUNT_CODES.bank;
    case "on_account":
      return SYSTEM_ACCOUNT_CODES.ap;
    default:
      return SYSTEM_ACCOUNT_CODES.cash;
  }
}

/** Goods received — inventory up; AP or cash/mpesa/bank depending on payment. */
export function buildGrnJournalLines(input: GrnPostingInput): JournalLineInput[] {
  const method: PurchasePaymentMethod =
    input.paymentMethod ??
    (input.onAccount === false ? "cash" : "on_account");
  const lines: JournalLineInput[] = [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.inventory,
      debit: input.inventoryValue,
      credit: 0,
      memo: "Inventory received",
    },
  ];
  if (input.taxAmount > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.vatInput,
      debit: input.taxAmount,
      credit: 0,
      memo: "VAT on purchases",
    });
  }
  const creditTotal = input.inventoryValue + input.taxAmount;
  lines.push({
    accountCode: purchaseCreditAccount(method),
    debit: 0,
    credit: creditTotal,
    memo:
      method === "on_account"
        ? "Supplier bill (AP)"
        : `Purchase paid (${method})`,
  });
  return lines;
}

/** Supplier return — reverse inventory; reduce AP or refund cash account. */
export function buildSupplierReturnJournalLines(input: {
  inventoryValue: number;
  paymentMethod: PurchasePaymentMethod;
}): JournalLineInput[] {
  const creditAccount = purchaseCreditAccount(input.paymentMethod);
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.inventory,
      debit: 0,
      credit: input.inventoryValue,
      memo: "Stock returned to supplier",
    },
    {
      accountCode: creditAccount,
      debit: input.inventoryValue,
      credit: 0,
      memo:
        input.paymentMethod === "on_account"
          ? "Reduce supplier AP"
          : "Purchase refund",
    },
  ];
}

export type ExpensePostingInput = {
  amount: number;
  paidFromCash: boolean;
  categoryAccountCode?: string;
};

export function buildExpenseJournalLines(input: ExpensePostingInput): JournalLineInput[] {
  const expenseCode = input.categoryAccountCode ?? "6040";
  return [
    {
      accountCode: expenseCode,
      debit: input.amount,
      credit: 0,
      memo: "Expense",
    },
    {
      accountCode: input.paidFromCash ? SYSTEM_ACCOUNT_CODES.cash : SYSTEM_ACCOUNT_CODES.ap,
      debit: 0,
      credit: input.amount,
      memo: input.paidFromCash ? "Paid from cash" : "Accrued expense",
    },
  ];
}

/** Customer pays down AR balance. */
export function buildCustomerPaymentJournalLines(
  amount: number,
  paymentMethod: "cash" | "mpesa" | "bank_transfer"
): JournalLineInput[] {
  const cashAccount =
    paymentMethod === "mpesa"
      ? SYSTEM_ACCOUNT_CODES.mpesa
      : paymentMethod === "bank_transfer"
        ? SYSTEM_ACCOUNT_CODES.bank
        : SYSTEM_ACCOUNT_CODES.cash;
  return [
    {
      accountCode: cashAccount,
      debit: amount,
      credit: 0,
      memo: "Customer payment received",
    },
    {
      accountCode: SYSTEM_ACCOUNT_CODES.ar,
      debit: 0,
      credit: amount,
      memo: "Reduce accounts receivable",
    },
  ];
}

/** Validate debits = credits before persisting. */
export function assertBalanced(lines: JournalLineInput[]): void {
  const debit = lines.reduce((s, l) => s + l.debit, 0);
  const credit = lines.reduce((s, l) => s + l.credit, 0);
  const d = Math.round((debit + Number.EPSILON) * 100) / 100;
  const c = Math.round((credit + Number.EPSILON) * 100) / 100;
  if (d !== c) {
    throw new Error(`Unbalanced journal: debit ${d} ≠ credit ${c}`);
  }
  if (d === 0) {
    throw new Error("Journal has zero total");
  }
}
