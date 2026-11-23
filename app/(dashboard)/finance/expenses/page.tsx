import { ExpensesPageClient } from "@/components/finance/expenses-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function ExpensesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Expenses"
        description="Totals by category for a month or custom date range. Record posts to GL."
      />
      <ExpensesPageClient />
    </div>
  );
}
