import { Suspense } from "react";
import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { Loader2 } from "lucide-react";

function CustomersLoading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Customers &amp; credit
        </h1>
        <p className="text-sm text-muted-foreground">
          Per outlet: who owes us, what we hold as deposit, and the statement.
          Switch branch in the header to work another outlet.
        </p>
      </div>
      <Suspense fallback={<CustomersLoading />}>
        <CustomersPageClient />
      </Suspense>
    </div>
  );
}
