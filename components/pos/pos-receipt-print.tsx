"use client";

import { formatTzs } from "@/lib/utils/currency";
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";

export type ReceiptPrintData = {
  organizationName: string;
  invoiceNo: string;
  totalAmount: number;
  changeGiven: number;
  balanceDue: number;
  paymentMethod: PaymentMethod;
  lines: { name: string; quantity: number; unit?: string; unitPrice: number }[];
  soldAt: Date;
  customerName?: string | null;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  taxRate?: number;
  isPreview?: boolean;
};

export type ReceiptStamp = "paid" | "credit_sale";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  bank_transfer: "Bank transfer",
  credit_account: "On account",
  cheque: "Cheque",
};

/** Credit stamp when on-account or any balance remains after payment. */
export function formatPaymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_LABELS[method];
}

export function getReceiptStamp(data: {
  paymentMethod: PaymentMethod;
  balanceDue: number;
}): ReceiptStamp {
  if (data.paymentMethod === "credit_account" || data.balanceDue > 0) {
    return "credit_sale";
  }
  return "paid";
}

export function printPosReceipt(data: ReceiptPrintData): boolean {
  const stamp = getReceiptStamp(data);
  const stampLabel = stamp === "credit_sale" ? "CREDIT SALE" : "PAID";
  const stampClass = stamp === "credit_sale" ? "stamp-credit" : "stamp-paid";
  const paymentLabel = PAYMENT_LABELS[data.paymentMethod];

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${data.invoiceNo}</title>
<style>
  body { font-family: ui-monospace, monospace; font-size: 12px; max-width: 280px; margin: 16px auto; color: #111; }
  h1 { font-size: 14px; margin: 0 0 4px; text-align: center; }
  .muted { color: #666; text-align: center; font-size: 11px; }
  hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .right { text-align: right; }
  .total { font-size: 14px; font-weight: bold; }
  .stamp { text-align: center; font-weight: 800; font-size: 15px; letter-spacing: 0.12em; margin: 10px auto 6px; padding: 6px 14px; border: 2px solid #111; display: inline-block; width: auto; }
  .stamp-wrap { text-align: center; }
  .stamp-paid { border-color: #111; }
  .stamp-credit { border-color: #b45309; color: #b45309; }
  .pay-method { text-align: center; font-size: 12px; font-weight: 700; margin: 0 0 8px; }
</style></head><body>
<h1>${escapeHtml(data.organizationName)}</h1>
${data.isPreview ? '<p class="muted" style="font-weight:bold">*** PREVIEW — NOT A TAX INVOICE ***</p>' : ""}
<p class="muted">${data.soldAt.toLocaleString()}<br/>${escapeHtml(data.invoiceNo)}</p>
${
  data.isPreview
    ? ""
    : `<div class="stamp-wrap"><div class="stamp ${stampClass}">${stampLabel}</div></div>
<p class="pay-method">Payment: ${escapeHtml(paymentLabel)}</p>`
}
${data.customerName ? `<p class="muted">Customer: ${escapeHtml(data.customerName)}</p>` : ""}
<hr/>
<table>
${data.lines
  .map(
    (l) =>
      `<tr><td>${escapeHtml(l.name)} × ${l.quantity}${l.unit ? ` ${escapeHtml(l.unit)}` : ""}</td><td class="right">${formatTzs(l.unitPrice * l.quantity)}</td></tr>`
  )
  .join("")}
</table>
${
  data.subtotal != null
    ? `<table>
<tr><td>Subtotal</td><td class="right">${formatTzs(data.subtotal)}</td></tr>
${
  data.discountAmount && data.discountAmount > 0
    ? `<tr><td>Discount</td><td class="right">-${formatTzs(data.discountAmount)}</td></tr>`
    : ""
}
${
  data.taxAmount != null
    ? `<tr><td>VAT${data.taxRate != null ? ` (${data.taxRate}%)` : ""}</td><td class="right">${formatTzs(data.taxAmount)}</td></tr>`
    : ""
}
</table><hr/>`
    : ""
}
<table>
<tr><td class="total">TOTAL</td><td class="right total">${formatTzs(data.totalAmount)}</td></tr>
${
  data.changeGiven > 0
    ? `<tr><td>Change</td><td class="right">${formatTzs(data.changeGiven)}</td></tr>`
    : ""
}
${
  data.balanceDue > 0
    ? `<tr><td>Balance due</td><td class="right">${formatTzs(data.balanceDue)}</td></tr>`
    : ""
}
</table>
<p class="muted" style="margin-top:12px">Thank you — SUPAFUNDI</p>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
