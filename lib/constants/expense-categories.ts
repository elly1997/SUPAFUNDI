export type ExpenseCategory = {
  id: string;
  label: string;
};

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "rent", label: "Rent" },
  { id: "utilities", label: "Utilities" },
  { id: "wages", label: "Wages" },
  { id: "bank", label: "Bank" },
  { id: "stock", label: "Stock" },
  { id: "misc", label: "Misc" },
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
        items.push({ id, label: label || formatExpenseCategoryLabel(id) });
      }
    }
    return items.length ? items : [...DEFAULT_EXPENSE_CATEGORIES];
  } catch {
    return [...DEFAULT_EXPENSE_CATEGORIES];
  }
}

export function serializeExpenseCategories(
  categories: ExpenseCategory[]
): string {
  return JSON.stringify(categories);
}
