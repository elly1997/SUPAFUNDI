export type BusinessExportType =
  | "customers"
  | "suppliers"
  | "sales"
  | "sale_items"
  | "payments"
  | "expenses"
  | "journal_lines";

export const BUSINESS_EXPORT_TYPES: {
  id: BusinessExportType;
  label: string;
  description: string;
  needsDateRange: boolean;
}[] = [
  {
    id: "customers",
    label: "Customers (AR)",
    description: "Master list with credit limits and open balances",
    needsDateRange: false,
  },
  {
    id: "suppliers",
    label: "Suppliers (AP)",
    description: "Master list with open payables",
    needsDateRange: false,
  },
  {
    id: "sales",
    label: "Sales",
    description: "Completed sales headers in the date range",
    needsDateRange: true,
  },
  {
    id: "sale_items",
    label: "Sale line items",
    description: "Product lines for sales in the date range",
    needsDateRange: true,
  },
  {
    id: "payments",
    label: "Payments",
    description: "Customer payments linked to sales",
    needsDateRange: true,
  },
  {
    id: "expenses",
    label: "Expenses",
    description: "Recorded operating expenses",
    needsDateRange: true,
  },
  {
    id: "journal_lines",
    label: "Journal lines (GL)",
    description: "Posted journal entry lines for audit",
    needsDateRange: true,
  },
];
