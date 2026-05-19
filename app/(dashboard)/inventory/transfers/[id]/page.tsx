import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { TransferDetailClient } from "@/components/inventory/transfer-detail-client";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

export default async function TransferDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/inventory/transfers"
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        ← All transfers
      </Link>
      <TransferDetailClient transferId={id} />
    </div>
  );
}
