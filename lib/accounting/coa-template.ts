/**
 * Default chart of accounts for TZ hardware retail (QuickBooks-style structure).
 * Seeded once per organization on setup.
 */
export type CoaTemplateRow = {
  code: string;
  name: string;
  account_type: "asset" | "liability" | "equity" | "income" | "expense" | "cogs";
  account_subtype?: string;
  normal_balance: "debit" | "credit";
  is_system: boolean;
};

export const DEFAULT_HARDWARE_COA: CoaTemplateRow[] = [
  { code: "1000", name: "Cash on Hand", account_type: "asset", account_subtype: "cash", normal_balance: "debit", is_system: true },
  { code: "1010", name: "M-Pesa / Mobile Money", account_type: "asset", account_subtype: "cash", normal_balance: "debit", is_system: true },
  { code: "1020", name: "Bank — Operating", account_type: "asset", account_subtype: "bank", normal_balance: "debit", is_system: true },
  { code: "1100", name: "Accounts Receivable", account_type: "asset", account_subtype: "ar", normal_balance: "debit", is_system: true },
  { code: "1150", name: "Employee Salary Advances", account_type: "asset", account_subtype: "employee_advances", normal_balance: "debit", is_system: true },
  { code: "1200", name: "Inventory Asset", account_type: "asset", account_subtype: "inventory", normal_balance: "debit", is_system: true },
  { code: "1300", name: "VAT Input (Purchases)", account_type: "asset", account_subtype: "tax", normal_balance: "debit", is_system: true },
  { code: "2000", name: "Accounts Payable", account_type: "liability", account_subtype: "ap", normal_balance: "credit", is_system: true },
  { code: "2050", name: "Customer Deposits", account_type: "liability", account_subtype: "deposits", normal_balance: "credit", is_system: true },
  { code: "2060", name: "Salaries Payable", account_type: "liability", account_subtype: "payroll", normal_balance: "credit", is_system: true },
  { code: "2100", name: "VAT Output (Sales)", account_type: "liability", account_subtype: "tax", normal_balance: "credit", is_system: true },
  { code: "3000", name: "Owner's Equity", account_type: "equity", account_subtype: "equity", normal_balance: "credit", is_system: true },
  { code: "3100", name: "Retained Earnings", account_type: "equity", account_subtype: "equity", normal_balance: "credit", is_system: true },
  { code: "4000", name: "Sales Revenue", account_type: "income", account_subtype: "sales", normal_balance: "credit", is_system: true },
  { code: "4100", name: "Sales Discounts", account_type: "income", account_subtype: "contra", normal_balance: "debit", is_system: true },
  { code: "5000", name: "Cost of Goods Sold", account_type: "cogs", account_subtype: "cogs", normal_balance: "debit", is_system: true },
  { code: "6000", name: "Rent Expense", account_type: "expense", account_subtype: "opex", normal_balance: "debit", is_system: false },
  { code: "6010", name: "Utilities", account_type: "expense", account_subtype: "opex", normal_balance: "debit", is_system: false },
  { code: "6020", name: "Wages & Salaries", account_type: "expense", account_subtype: "payroll", normal_balance: "debit", is_system: false },
  { code: "6030", name: "Bank Charges", account_type: "expense", account_subtype: "opex", normal_balance: "debit", is_system: false },
  { code: "6040", name: "Miscellaneous Expense", account_type: "expense", account_subtype: "opex", normal_balance: "debit", is_system: false },
  { code: "6050", name: "Cash Over / Short", account_type: "expense", account_subtype: "cash_variance", normal_balance: "debit", is_system: true },
];

/** System account codes used by automated posting rules. */
export const SYSTEM_ACCOUNT_CODES = {
  cash: "1000",
  mpesa: "1010",
  bank: "1020",
  ar: "1100",
  employeeAdvances: "1150",
  inventory: "1200",
  vatInput: "1300",
  ap: "2000",
  customerDeposits: "2050",
  salariesPayable: "2060",
  vatOutput: "2100",
  cashOverShort: "6050",
  salesRevenue: "4000",
  salesDiscount: "4100",
  cogs: "5000",
} as const;
