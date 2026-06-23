import { Suspense } from "react";
import { SuppliersPageClient } from "@/components/suppliers/suppliers-page-client";
import { PageHeader } from "@/components/ui/page-header";
import { Loader2 } from "lucide-react";

function SuppliersLoading() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers & payables"
        description="Supplier accounts, amounts due, open bills, and purchase history."
      />
      <Suspense fallback={<SuppliersLoading />}>
        <SuppliersPageClient />
      </Suspense>
    </div>
  );
}
