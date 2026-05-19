import { SuppliersPageClient } from "@/components/suppliers/suppliers-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function SuppliersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Supplier accounts, payables, and purchase history."
      />
      <SuppliersPageClient />
    </div>
  );
}
