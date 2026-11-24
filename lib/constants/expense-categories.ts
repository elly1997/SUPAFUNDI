export type ExpenseCategory = {
  id: string;
  label: string;
  /** GL account code (e.g. 6040); optional — defaults by category id. */
  accountCode?: string;
};

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "rent", label: "Rent", accountCode: "6000" },
  { id: "utilities", label: "Utilities", accountCode: "6010" },
  { id: "wages", label: "Wages", accountCode: "6020" },
  { id: "salary_advance", label: "Salary advance", accountCode: "1150" },
  { id: "bank", label: "Bank charges", accountCode: "6030" },
  { id: "stock", label: "Stock", accountCode: "6040" },
  { id: "misc", label: "Misc", accountCode: "6040" },
];

export function formatExpenseCategoryLabel(id: string): string {
  const known = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === id);
  if (known) return known.label;
  return id
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function slugifyExpenseCategory(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "misc";
}

/** Category id that links an expense to an employee and deducts from payroll. */
export const SALARY_ADVANCE_CATEGORY_ID = "salary_advance";

/** Legacy / typo ids that must behave as salary advance (payroll deduction). */
const SALARY_ADVANCE_ALIASES = new Set([
  "salary_advance",
  "salary advance",
  "advance_salary",
  "advance salary",
  "salary_adv",
  "staff_advance",
  "employee_advance",
]);

export function isSalaryAdvanceCategory(
  category: string | null | undefined
): boolean {
  return SALARY_ADVANCE_ALIASES.has((category ?? "").trim().toLowerCase());
}

/** Built-ins that must always appear in pickers, even if the saved list omits them. */
const REQUIRED_CATEGORY_IDS = [SALARY_ADVANCE_CATEGORY_ID] as const;

function ensureRequiredCategories(items: ExpenseCategory[]): ExpenseCategory[] {
  /** Drop duplicate advance aliases (e.g. custom "ADVANCE SALARY") — use the built-in. */
  const cleaned = items.filter(
    (c) =>
      c.id === SALARY_ADVANCE_CATEGORY_ID || !isSalaryAdvanceCategory(c.id)
  );
  const out = [...cleaned];
  for (const id of REQUIRED_CATEGORY_IDS) {
    if (out.some((c) => c.id === id)) continue;
    const def = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === id);
    if (def) {
      /** Place right after "wages" when present, else append. */
      const wagesIdx = out.findIndex((c) => c.id === "wages");
      if (wagesIdx >= 0) out.splice(wagesIdx + 1, 0, { ...def });
      else out.push({ ...def });
    }
  }
  return out;
}

export function parseExpenseCategoriesJson(
  raw: string | null | undefined
): ExpenseCategory[] {
  if (!raw?.trim()) return [...DEFAULT_EXPENSE_CATEGORIES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_EXPENSE_CATEGORIES];
    const items: ExpenseCategory[] = [];
    for (const row of parsed) {
      if (typeof row === "string" && row.trim()) {
        const id = row.trim().toLowerCase();
        items.push({ id, label: formatExpenseCategoryLabel(id) });
        continue;
      }
      if (row && typeof row === "object" && "id" in row) {
        const id = String((row as { id: unknown }).id)
          .trim()
          .toLowerCase();
        if (!id) continue;
        const label =
          "label" in row && (row as { label: unknown }).label
            ? String((row as { label: string }).label).trim()
            : formatExpenseCategoryLabel(id);
        const accountCode =
          "accountCode" in row && (row as { accountCode: unknown }).accountCode
            ? String((row as { accountCode: string }).accountCode).trim()
            : undefined;
        items.push({
          id,
          label: label || formatExpenseCategoryLabel(id),
          accountCode: accountCode || undefined,
        });
      }
    }
    return items.length
      ? ensureRequiredCategories(items)
      : [...DEFAULT_EXPENSE_CATEGORIES];
  } catch {
    return [...DEFAULT_EXPENSE_CATEGORIES];
  }
}

export function serializeExpenseCategories(
  categories: ExpenseCategory[]
): string {
  return JSON.stringify(categories);
}
