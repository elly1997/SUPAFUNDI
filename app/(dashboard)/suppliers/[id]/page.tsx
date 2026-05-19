import Link from "next/link";
import { SupplierDetailClient } from "@/components/suppliers/supplier-detail-client";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";

type Props = { params: { id: string } };

export default function SupplierDetailPage({ params }: Props) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier profile"
        description="Bills, payables, and purchase orders."
        actions={
          <Link
            href="/suppliers"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft className="mr-2 size-4" />
            All suppliers
          </Link>
        }
      />
      <SupplierDetailClient supplierId={params.id} />
    </div>
  );
}
