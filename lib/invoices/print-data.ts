import { formatTzs } from "@/lib/utils/currency";
import { saleTypeLabel } from "@/lib/constants/sale-documents";

export type SaleDocumentPrintLine = {
  name: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  lineTotal: number;
};

export type PaymentAccountPrintLine = {
  name: string;
  typeLabel: string;
  details: string;
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
  bankAccountLabel?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  status: string;
  lines: SaleDocumentPrintLine[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid?: number;
  balanceDue?: number;
  notes?: string | null;
  paymentAccounts?: PaymentAccountPrintLine[];
};

function parseValidUntil(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Valid until:\s*(\d{4}-\d{2}-\d{2})/i);
  return m?.[1] ?? null;
}

function parsePreferredBankAccount(
  notes: string | null | undefined
): string | null {
  if (!notes) return null;
  const m = notes.match(/Preferred bank account:\s*(.+)$/im);
  return m?.[1]?.trim() ?? null;
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
  customerPhone?: string | null;
  customerEmail?: string | null;
  status: string;
  items: {
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    unit?: string | null;
  }[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid?: number;
  balanceDue?: number;
  notes?: string | null;
  paymentAccounts?: PaymentAccountPrintLine[];
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
    bankAccountLabel: parsePreferredBankAccount(input.notes),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    status: input.status,
    lines: input.items.map((i) => ({
      name: i.product_name,
      quantity: i.quantity,
      unit: i.unit ?? null,
      unitPrice: i.unit_price,
      lineTotal: i.total_price,
    })),
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    taxRate: input.taxRate,
    taxAmount: input.taxAmount,
    totalAmount: input.totalAmount,
    amountPaid: input.amountPaid,
    balanceDue: input.balanceDue,
    notes: input.notes,
    paymentAccounts: input.paymentAccounts,
  };
}

export function buildSaleDocumentWhatsAppMessage(
  data: SaleDocumentPrintData
): string {
  const title = saleTypeLabel(data.saleType);
  const lines = data.lines
    .map(
      (l, i) =>
        `${i + 1}. ${l.name} — ${l.quantity}${l.unit ? ` ${l.unit}` : ""} × ${l.lineTotal}`
    )
    .join("\n");
  const parts = [
    `*${data.organizationName}*`,
    `*${title}* ${data.invoiceNo}`,
    data.customerName ? `Customer: ${data.customerName}` : null,
    `Date: ${data.documentDate}`,
    data.validUntil ? `Valid until: ${data.validUntil}` : null,
    "",
    lines || "No line items",
    "",
    `*Total: ${formatTzs(data.totalAmount)}*`,
    data.balanceDue != null && data.balanceDue > 0
      ? `Balance due: ${formatTzs(data.balanceDue)}`
      : null,
    "",
    "Payment details available on the printed document.",
    `— ${data.organizationName}`,
  ];
  return parts.filter((p) => p != null).join("\n");
}
