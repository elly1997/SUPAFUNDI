import { ReceiveGoodsClient } from "@/components/inventory/receive-goods-client";
import { PageHeader } from "@/components/ui/page-header";

export default function ReceiveGoodsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive goods"
        description="Record a GRN, increase stock, and post to the general ledger."
      />
      <ReceiveGoodsClient />
    </div>
  );
}
