"use client";

import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { formatTzs } from "@/lib/utils/currency";

export type SaleDocumentPrintLine = {
  name: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  lineTotal: number;
};

export type SaleDocumentPrintData = {
  organizationName: string;
  tagline?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  saleType: string;
  invoiceNo: string;
  documentDate: string;
  validUntil?: string | null;
  customerName?: string | null;
  status: string;
  lines: SaleDocumentPrintLine[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
};

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseValidUntil(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Valid until:\s*(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] ?? null;
}

export function buildSaleDocumentPrintData(input: {
  organizationName: string;
  tagline?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  saleType: string;
  invoiceNo: string;
  documentDate: string;
  customerName?: string | null;
  status: string;
  items: {
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string | null;
}): SaleDocumentPrintData {
  return {
    organizationName: input.organizationName,
    tagline: input.tagline ?? "Hardware Dealership • Wholesale & Retail",
    address: input.address,
    phone: input.phone,
    email: input.email,
    taxId: input.taxId,
    saleType: input.saleType,
    invoiceNo: input.invoiceNo,
    documentDate: input.documentDate,
    validUntil: parseValidUntil(input.notes),
    customerName: input.customerName,
    status: input.status,
    lines: input.items.map((i) => ({
      name: i.product_name,
      quantity: i.quantity,
      unitPrice: i.unit_price,
      lineTotal: i.total_price,
    })),
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    taxRate: input.taxRate,
    taxAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    notes: input.notes,
  };
}

export function printSaleDocument(data: SaleDocumentPrintData): boolean {
  const title = saleTypeLabel(data.saleType);
  const isDraft = data.status === "draft";
  const contact = [
    data.address,
    data.phone ? `Tel: ${data.phone}` : null,
    data.email,
    data.taxId ? `TIN: ${data.taxId}` : null,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(String(line))}</div>`)
    .join("");

  const lineRows = data.lines
    .map(
      (l, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(l.name)}</td>
      <td class="num">${l.quantity}${l.unit ? ` ${escapeHtml(l.unit)}` : ""}</td>
      <td class="money">${formatTzs(l.unitPrice)}</td>
      <td class="money">${formatTzs(l.lineTotal)}</td>
    </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(data.invoiceNo)} — ${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 16px 20px; }
  .letterhead { border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 22pt; font-weight: 800; letter-spacing: 0.02em; color: #0f172a; margin: 0; }
  .tagline { font-size: 10pt; color: #64748b; margin: 4px 0 0; }
  .contact { font-size: 9pt; color: #475569; margin-top: 8px; line-height: 1.45; }
  .doc-meta { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; flex-wrap: wrap; }
  .doc-title { font-size: 16pt; font-weight: 700; color: #ea580c; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta-block { font-size: 10pt; color: #334155; }
  .meta-block strong { color: #0f172a; }
  table.items { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  table.items th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 6px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; }
  table.items td { border: 1px solid #e2e8f0; padding: 7px 6px; vertical-align: top; }
  table.items th.num, table.items td.num { text-align: center; width: 36px; }
  table.items th.money, table.items td.money { text-align: right; font-family: ui-monospace, monospace; white-space: nowrap; }
  .totals { margin-left: auto; width: min(280px, 100%); }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 4px 0; font-size: 10pt; }
  .totals td:last-child { text-align: right; font-family: ui-monospace, monospace; }
  .totals .grand td { font-size: 12pt; font-weight: 700; border-top: 2px solid #0f172a; padding-top: 8px; margin-top: 4px; }
  .draft-banner { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; padding: 8px 12px; font-size: 10pt; margin-bottom: 16px; text-align: center; font-weight: 600; }
  .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; }
  @media print { body { padding: 0; } }
</style></head><body>
<header class="letterhead">
  <h1 class="brand">${escapeHtml(data.organizationName)}</h1>
  <p class="tagline">${escapeHtml(data.tagline ?? "Hardware Dealership • Wholesale & Retail")}</p>
  ${contact ? `<div class="contact">${contact}</div>` : ""}
</header>
${isDraft ? '<div class="draft-banner">DRAFT — Not a tax invoice until finalized</div>' : ""}
<div class="doc-meta">
  <div>
    <h2 class="doc-title">${escapeHtml(title)}</h2>
    <div class="meta-block"><strong>Document no:</strong> ${escapeHtml(data.invoiceNo)}</div>
    <div class="meta-block"><strong>Date:</strong> ${escapeHtml(data.documentDate)}</div>
    ${data.validUntil ? `<div class="meta-block"><strong>Valid until:</strong> ${escapeHtml(data.validUntil)}</div>` : ""}
  </div>
  <div class="meta-block" style="text-align:right">
    ${data.customerName ? `<div><strong>Customer:</strong><br/>${escapeHtml(data.customerName)}</div>` : "<div><strong>Customer:</strong> Walk-in</div>"}
  </div>
</div>
<table class="items">
  <thead>
    <tr>
      <th class="num">#</th>
      <th>Description</th>
      <th class="num">Qty</th>
      <th class="money">Unit price</th>
      <th class="money">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${lineRows || '<tr><td colspan="5" style="text-align:center;color:#64748b">No line items</td></tr>'}
  </tbody>
</table>
<div class="totals">
  <table>
    <tr><td>Subtotal</td><td>${formatTzs(data.subtotal)}</td></tr>
    ${
      data.discountAmount > 0
        ? `<tr><td>Discount</td><td>-${formatTzs(data.discountAmount)}</td></tr>`
        : ""
    }
    ${
      data.taxAmount > 0
        ? `<tr><td>VAT (${data.taxRate}%)</td><td>${formatTzs(data.taxAmount)}</td></tr>`
        : ""
    }
    <tr class="grand"><td>Total (TZS)</td><td>${formatTzs(data.totalAmount)}</td></tr>
  </table>
</div>
${
  data.notes && !data.notes.match(/^Valid until:/i)
    ? `<div class="footer"><strong>Notes:</strong> ${escapeHtml(data.notes.replace(/Valid until:[^\n]*/gi, "").trim())}</div>`
    : ""
}
<div class="footer">Thank you for your business — ${escapeHtml(data.organizationName)}</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
