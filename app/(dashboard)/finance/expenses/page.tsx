import { ExpensesPageClient } from "@/components/finance/expenses-page-client";

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Record operating expenses with automatic GL posting.
        </p>
      </div>
      <ExpensesPageClient />
    </div>
  );
}
