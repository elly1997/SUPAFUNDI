import { CustomersPageClient } from "@/components/customers/customers-page-client";

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Manage retail and trade accounts, credit limits, and balances.
        </p>
      </div>
      <CustomersPageClient />
    </div>
  );
}
