export const dynamic = "force-dynamic";

import { ExpenseCategoriesSettings } from "@/components/settings/expense-categories-settings";
import { PageHeader } from "@/components/ui/page-header";

export default function ExpenseCategoriesSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Expense categories"
        description="Groups used in POS cash out and on the Expenses page."
      />
      <ExpenseCategoriesSettings />
    </div>
  );
}
