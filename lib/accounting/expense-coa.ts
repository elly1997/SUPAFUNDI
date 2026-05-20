import { listExpenseCategories } from "@/lib/actions/settings";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants/expense-categories";

/** Default GL code per built-in expense category id. */
export const DEFAULT_CATEGORY_ACCOUNT_CODES: Record<string, string> = {
  rent: "6000",
  utilities: "6010",
  wages: "6020",
  bank: "6030",
  stock: "6040",
  misc: "6040",
};

export function defaultAccountCodeForCategory(categoryId: string): string {
  return DEFAULT_CATEGORY_ACCOUNT_CODES[categoryId.trim().toLowerCase()] ?? "6040";
}

/** Resolve expense category id → chart of accounts code (settings override optional). */
export async function resolveExpenseAccountCode(
  categoryId: string
): Promise<string> {
  const id = categoryId.trim().toLowerCase();
  try {
    const categories = await listExpenseCategories();
    const match = categories.find((c) => c.id === id);
    if (match?.accountCode) return match.accountCode;
  } catch {
    /* fall through to defaults */
  }
  const builtIn = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.id === id);
  if (builtIn?.accountCode) return builtIn.accountCode;
  return defaultAccountCodeForCategory(id);
}
