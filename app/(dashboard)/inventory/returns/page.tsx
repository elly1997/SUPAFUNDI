import { SupplierReturnsClient } from "@/components/inventory/supplier-returns-client";
import { PageHeader } from "@/components/ui/page-header";

export default function SupplierReturnsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier returns"
        description="Return stock to suppliers — reduces inventory and AP or refunds cash."
      />
      <SupplierReturnsClient />
    </div>
  );
}
