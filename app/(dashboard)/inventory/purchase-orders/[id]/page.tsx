import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PurchaseOrderDetailClient } from "@/components/inventory/purchase-order-detail-client";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export default async function PurchaseOrderDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/inventory/purchase-orders"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        ← All purchase orders
      </Link>
      <PurchaseOrderDetailClient poId={id} />
    </div>
  );
}
