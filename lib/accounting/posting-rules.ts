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
  surchargeAmount?: number;
  taxAmount: number;
  totalAmount: number;
  /** Cash/M-Pesa/bank collected at checkout (excludes deposit applied). */
  cashAmountPaid: number;
  depositApplied: number;
  balanceDue: number;
  paymentMethod: "cash" | "mpesa" | "card" | "bank_transfer" | "credit_account" | "cheque" | "loyalty_points";
  cogsAmount: number;
};

function paymentAssetAccount(
  paymentMethod: SalePostingInput["paymentMethod"]
): string {
  if (paymentMethod === "mpesa") return SYSTEM_ACCOUNT_CODES.mpesa;
  if (paymentMethod === "bank_transfer" || paymentMethod === "card") {
    return SYSTEM_ACCOUNT_CODES.bank;
  }
  if (paymentMethod === "credit_account") return SYSTEM_ACCOUNT_CODES.ar;
  return SYSTEM_ACCOUNT_CODES.cash;
}

/** Retail sale: deposit liability, cash/M-Pesa/bank, AR, revenue, VAT, COGS. */
export function buildSaleJournalLines(input: SalePostingInput): JournalLineInput[] {
  const lines: JournalLineInput[] = [];

  const cashAccount = paymentAssetAccount(input.paymentMethod);
  const onCredit = input.balanceDue;
  const surchargeAmount = input.surchargeAmount ?? 0;

  if (input.depositApplied > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.customerDeposits,
      debit: input.depositApplied,
      credit: 0,
      memo: "Customer deposit applied",
    });
  }
  if (input.cashAmountPaid > 0) {
    lines.push({
      accountCode: cashAccount,
      debit: input.cashAmountPaid,
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

  if (input.subtotal > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.salesRevenue,
      debit: 0,
      credit: input.subtotal,
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
  if (surchargeAmount > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.salesRevenue,
      debit: 0,
      credit: surchargeAmount,
      memo: "Overcharge / rounding",
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

/** Mirror an existing sale journal (debits ↔ credits) for voids/returns. */
export function buildReversingJournalLines(
  original: JournalLineInput[]
): JournalLineInput[] {
  return original.map((l) => ({
    accountCode: l.accountCode,
    debit: l.credit,
    credit: l.debit,
    memo: l.memo ? `Reversal: ${l.memo}` : "Reversal",
  }));
}

/** Customer prepayment — Dr cash/M-Pesa/bank · Cr customer deposits liability. */
export function buildCustomerDepositJournalLines(
  amount: number,
  paymentMethod: "cash" | "mpesa" | "bank_transfer"
): JournalLineInput[] {
  return buildCustomerDepositReceiptJournalLines(
    amount,
    0,
    amount,
    paymentMethod
  );
}

/** Deposit receipt split between AR (credit payment) and deposit liability. */
export function buildCustomerDepositReceiptJournalLines(
  totalAmount: number,
  toCredit: number,
  toDeposit: number,
  paymentMethod: "cash" | "mpesa" | "bank_transfer"
): JournalLineInput[] {
  const asset =
    paymentMethod === "mpesa"
      ? SYSTEM_ACCOUNT_CODES.mpesa
      : paymentMethod === "bank_transfer"
        ? SYSTEM_ACCOUNT_CODES.bank
        : SYSTEM_ACCOUNT_CODES.cash;
  const lines: JournalLineInput[] = [
    {
      accountCode: asset,
      debit: totalAmount,
      credit: 0,
      memo: "Customer deposit received",
    },
  ];
  if (toCredit > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.ar,
      debit: 0,
      credit: toCredit,
      memo: "Applied to credit balance",
    });
  }
  if (toDeposit > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNT_CODES.customerDeposits,
      debit: 0,
      credit: toDeposit,
      memo: "Customer deposit liability",
    });
  }
  return lines;
}

/** Daily cash count variance: positive = over, negative = short. */
export function buildCashVarianceJournalLines(variance: number): JournalLineInput[] {
  const amount = Math.abs(variance);
  if (amount === 0) return [];
  if (variance > 0) {
    return [
      {
        accountCode: SYSTEM_ACCOUNT_CODES.cash,
        debit: amount,
        credit: 0,
        memo: "Cash overage",
      },
      {
        accountCode: SYSTEM_ACCOUNT_CODES.cashOverShort,
        debit: 0,
        credit: amount,
        memo: "Cash over (credit to variance account)",
      },
    ];
  }
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.cashOverShort,
      debit: amount,
      credit: 0,
      memo: "Cash shortage",
    },
    {
      accountCode: SYSTEM_ACCOUNT_CODES.cash,
      debit: 0,
      credit: amount,
      memo: "Cash short",
    },
  ];
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

/** Move cash from drawer to bank — asset transfer, no P&L impact. */
export function buildCashToBankJournalLines(amount: number): JournalLineInput[] {
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.bank,
      debit: amount,
      credit: 0,
      memo: "Cash deposited to bank",
    },
    {
      accountCode: SYSTEM_ACCOUNT_CODES.cash,
      debit: 0,
      credit: amount,
      memo: "Cash out of drawer",
    },
  ];
}

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

/** Pay supplier bill — Dr AP · Cr cash/M-Pesa/bank. */
export function buildSupplierPaymentJournalLines(
  amount: number,
  paymentMethod: "cash" | "mpesa" | "bank_transfer" | "cheque"
): JournalLineInput[] {
  const cashAccount =
    paymentMethod === "mpesa"
      ? SYSTEM_ACCOUNT_CODES.mpesa
      : paymentMethod === "bank_transfer" || paymentMethod === "cheque"
        ? SYSTEM_ACCOUNT_CODES.bank
        : SYSTEM_ACCOUNT_CODES.cash;
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.ap,
      debit: amount,
      credit: 0,
      memo: "Supplier payment",
    },
    {
      accountCode: cashAccount,
      debit: 0,
      credit: amount,
      memo: "Cash/bank out",
    },
  ];
}

/** Apply customer deposit liability against open AR (no cash movement). */
export function buildDepositAppliedToCreditJournalLines(
  amount: number
): JournalLineInput[] {
  return [
    {
      accountCode: SYSTEM_ACCOUNT_CODES.customerDeposits,
      debit: amount,
      credit: 0,
      memo: "Customer deposit applied to AR",
    },
    {
      accountCode: SYSTEM_ACCOUNT_CODES.ar,
      debit: 0,
      credit: amount,
      memo: "Reduce accounts receivable",
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
