import { PurchaseOrdersPageClient } from "@/components/inventory/purchase-orders-page-client";

export default function PurchaseOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
        <p className="text-sm text-muted-foreground">
          Order from suppliers, then receive goods against the PO (posts to GL).
        </p>
      </div>
      <PurchaseOrdersPageClient />
    </div>
  );
}
