import { PurchaseOrdersPageClient } from "@/components/inventory/purchase-orders-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase orders"
        description="Order from suppliers, receive goods, and post to inventory and GL."
      />
      <PurchaseOrdersPageClient />
    </div>
  );
}
