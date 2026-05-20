import { format } from "date-fns";
import { formatTzs } from "@/lib/utils/currency";

export type ClosingReportData = {
  outletName: string;
  businessDate: string;
  openingBalance: number;
  cashSales: number;
  mpesaSales: number;
  cashExpenses: number;
  bankDeposits: number;
  expectedCash: number;
  closingBalance: number | null;
  variance: number | null;
  status: "open" | "reconciled";
  reconciledAt?: string | null;
};

export function formatClosingReportText(data: ClosingReportData): string {
  const dateLabel = format(
    new Date(data.businessDate + "T12:00:00"),
    "EEE d MMM yyyy"
  );
  const lines = [
    `SUPAFUNDI — Daily closing`,
    `${data.outletName}`,
    `Date: ${dateLabel}`,
    ``,
    `Opening cash: ${formatTzs(data.openingBalance)}`,
    `+ Cash sales: ${formatTzs(data.cashSales)}`,
    `+ M-Pesa sales: ${formatTzs(data.mpesaSales)}`,
    `- Cash expenses: ${formatTzs(data.cashExpenses)}`,
    `- Bank deposits: ${formatTzs(data.bankDeposits)}`,
    `= Expected cash: ${formatTzs(data.expectedCash)}`,
  ];
  if (data.closingBalance != null) {
    lines.push(`Counted closing: ${formatTzs(data.closingBalance)}`);
    lines.push(
      `Variance: ${formatTzs(data.variance ?? data.closingBalance - data.expectedCash)}`
    );
  }
  lines.push(
    `Status: ${data.status === "reconciled" ? "Reconciled" : "Pending reconciliation"}`
  );
  return lines.join("\n");
}

/** Opens WhatsApp with pre-filled message (no API key required). */
export function buildWhatsAppShareUrl(phoneE164: string, message: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
