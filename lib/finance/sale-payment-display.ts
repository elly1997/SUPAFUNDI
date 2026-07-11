import { roundMoney } from "@/lib/utils/calculations";

export type SalePaymentLine = {
  method: string;
  label: string;
  amount: number;
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  bank_transfer: "Bank",
  credit_account: "On account",
  on_account: "On account",
  cheque: "Cheque",
  loyalty_points: "Loyalty",
  deposit: "Customer deposit",
};

export function salePaymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return METHOD_LABELS[method] ?? method.replace(/_/g, " ");
}

export function buildSalePaymentBreakdown(input: {
  payments: { payment_method: string; amount: number }[];
  depositApplied?: number;
  balanceDue: number;
}): SalePaymentLine[] {
  const merged = new Map<string, number>();
  for (const row of input.payments) {
    const method = row.payment_method;
    merged.set(method, (merged.get(method) ?? 0) + Number(row.amount));
  }

  const lines: SalePaymentLine[] = Array.from(merged.entries()).map(
    ([method, amount]) => ({
      method,
      label: salePaymentMethodLabel(method),
      amount: roundMoney(amount),
    })
  );

  const deposit = roundMoney(input.depositApplied ?? 0);
  if (deposit > 0) {
    lines.push({
      method: "deposit",
      label: METHOD_LABELS.deposit,
      amount: deposit,
    });
  }

  const balance = roundMoney(input.balanceDue);
  if (balance > 0) {
    lines.push({
      method: "on_account",
      label: METHOD_LABELS.on_account,
      amount: balance,
    });
  }

  return lines;
}

export function summarizeSalePaymentLabels(lines: SalePaymentLine[]): string {
  if (lines.length === 0) return "—";
  return lines.map((l) => l.label).join(" + ");
}
