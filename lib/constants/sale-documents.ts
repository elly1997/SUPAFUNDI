export const SALE_DOCUMENT_TYPES = [
  "retail",
  "wholesale",
  "quotation",
  "proforma",
  "delivery_note",
] as const;

export type SaleDocumentType = (typeof SALE_DOCUMENT_TYPES)[number];

export const INVOICE_TAB_TYPES = [
  {
    id: "invoices",
    label: "Customer invoices",
    types: ["retail", "wholesale"] as SaleDocumentType[],
    customerRequired: true,
    balanceDueMin: 0.01,
    status: ["completed"] as const,
  },
  { id: "quotations", label: "Quotations", types: ["quotation"] as SaleDocumentType[] },
  { id: "proforma", label: "Proforma", types: ["proforma"] as SaleDocumentType[] },
  { id: "delivery", label: "Delivery notes", types: ["delivery_note"] as SaleDocumentType[] },
] as const;

export type InvoiceTabId = (typeof INVOICE_TAB_TYPES)[number]["id"];

export function saleTypeLabel(type: string): string {
  const map: Record<string, string> = {
    retail: "Retail invoice",
    wholesale: "Wholesale invoice",
    quotation: "Quotation",
    proforma: "Proforma",
    delivery_note: "Delivery note",
  };
  return map[type] ?? type;
}

export function invoicePrefixForType(type: SaleDocumentType): string {
  switch (type) {
    case "quotation":
      return "QUO";
    case "proforma":
      return "PRO";
    case "delivery_note":
      return "DEL";
    case "wholesale":
      return "WHL";
    default:
      return "";
  }
}
