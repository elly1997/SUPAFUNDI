/**
 * QuickBooks parity matrix + launch gates for HardwarePOS.
 * Status is derived from codebase capabilities (update when modules ship).
 */

export type LaunchItemStatus = "done" | "partial" | "missing" | "schema_only";

export type LaunchCheckItem = {
  id: string;
  area: string;
  quickBooksFeature: string;
  status: LaunchItemStatus;
  notes: string;
  launchBlocker: boolean;
};

export const LAUNCH_CHECKLIST: LaunchCheckItem[] = [
  {
    id: "auth",
    area: "Company & users",
    quickBooksFeature: "Company file, users, roles",
    status: "done",
    notes: "Auth, org setup, roles, outlet selector",
    launchBlocker: false,
  },
  {
    id: "coa",
    area: "Chart of accounts",
    quickBooksFeature: "Chart of Accounts",
    status: "done",
    notes: "Default COA seeded on org setup; GL tables in DB",
    launchBlocker: false,
  },
  {
    id: "products",
    area: "Products & services",
    quickBooksFeature: "Product/service list, inventory items",
    status: "done",
    notes: "CRUD, auto SKU, Excel import, retail pricing",
    launchBlocker: false,
  },
  {
    id: "pos",
    area: "Sales receipts / POS",
    quickBooksFeature: "Sales Receipt, Invoice, POS",
    status: "done",
    notes: "Full-screen POS, checkout, stock decrement, sales list",
    launchBlocker: false,
  },
  {
    id: "gl_post",
    area: "General ledger",
    quickBooksFeature: "Automatic journal from transactions",
    status: "done",
    notes: "Sales (incl. deposits), GRN, expenses, deposits, voids, cash variance post to GL",
    launchBlocker: false,
  },
  {
    id: "ar",
    area: "Accounts receivable",
    quickBooksFeature: "Customer balance, aging, statements",
    status: "partial",
    notes: "Customers + credit page + POS credit sales; aging view pending",
    launchBlocker: false,
  },
  {
    id: "ap",
    area: "Accounts payable",
    quickBooksFeature: "Enter Bills, Pay Bills",
    status: "schema_only",
    notes: "supplier_bills tables added; UI + posting not wired",
    launchBlocker: false,
  },
  {
    id: "bank",
    area: "Banking",
    quickBooksFeature: "Bank feeds, reconciliation",
    status: "partial",
    notes: "bank_accounts + transactions schema; reconcile UI missing",
    launchBlocker: false,
  },
  {
    id: "inventory",
    area: "Inventory",
    quickBooksFeature: "Qty on hand, COGS, adjustments",
    status: "partial",
    notes: "Stock, GRN, PO receive, inter-outlet transfers; adjustments UI stub",
    launchBlocker: false,
  },
  {
    id: "vat",
    area: "Sales tax (VAT)",
    quickBooksFeature: "Sales tax center, returns",
    status: "partial",
    notes: "18% on sales schema; tax_codes table; VAT report UI missing",
    launchBlocker: false,
  },
  {
    id: "reports",
    area: "Reports",
    quickBooksFeature: "P&L, Balance Sheet, Trial Balance",
    status: "partial",
    notes: "Trial balance, P&L, and balance sheet from GL; export/print pending",
    launchBlocker: false,
  },
  {
    id: "cash_session",
    area: "Cash drawer",
    quickBooksFeature: "Cash management / register",
    status: "done",
    notes: "Open/close drawer on POS with variance",
    launchBlocker: false,
  },
  {
    id: "mpesa",
    area: "Payments",
    quickBooksFeature: "Payment recording",
    status: "partial",
    notes: "STK push API + callback when MPESA_* env configured",
    launchBlocker: false,
  },
  {
    id: "audit",
    area: "Audit trail",
    quickBooksFeature: "Audit log",
    status: "schema_only",
    notes: "audit_log table; not populated from app yet",
    launchBlocker: false,
  },
  {
    id: "period_close",
    area: "Period close",
    quickBooksFeature: "Close books",
    status: "schema_only",
    notes: "fiscal_periods table; close workflow not built",
    launchBlocker: false,
  },
  {
    id: "offline",
    area: "Offline POS",
    quickBooksFeature: "— (POS-specific)",
    status: "partial",
    notes: "Dexie queue stub; sync worker not wired",
    launchBlocker: false,
  },
  {
    id: "settings",
    area: "Settings",
    quickBooksFeature: "Company preferences, users",
    status: "done",
    notes: "General, outlets with codes, user invite and roles",
    launchBlocker: false,
  },
  {
    id: "design_system",
    area: "Design & UX",
    quickBooksFeature: "— (brand / POS UX)",
    status: "done",
    notes:
      "SUPAFUNDI dark theme, orange brand, horizontal nav, TZS formatting, PWA theme",
    launchBlocker: false,
  },
];

export function getLaunchSummary() {
  const items = LAUNCH_CHECKLIST;
  const blockers = items.filter((i) => i.launchBlocker);
  const done = items.filter((i) => i.status === "done").length;
  const partial = items.filter((i) => i.status === "partial").length;
  const missing = items.filter((i) => i.status === "missing").length;
  const schemaOnly = items.filter((i) => i.status === "schema_only").length;
  const blockerOpen = blockers.filter(
    (i) => i.status !== "done"
  ).length;
  const readyForSoftLaunch = blockerOpen === 0;
  const percentComplete = Math.round(
    ((done + partial * 0.5) / items.length) * 100
  );
  return {
    total: items.length,
    done,
    partial,
    missing,
    schemaOnly,
    blockerOpen,
    blockers,
    readyForSoftLaunch,
    percentComplete,
  };
}
