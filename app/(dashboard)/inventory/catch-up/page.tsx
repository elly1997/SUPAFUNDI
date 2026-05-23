import { HistoricalCatchUpClient } from "@/components/inventory/historical-catch-up-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HistoricalCatchUpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Historical catch-up"
        description="Backfill purchases and sales by business date after your opening stock import. Work day by day using delivery notes and Z-reports — no full recount required if every transaction is entered."
        actions={
          <>
            <Link
              href="/inventory/stock"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Stock
            </Link>
            <Link href="/pos" className={cn(buttonVariants({ size: "sm" }))}>
              POS
            </Link>
          </>
        }
      />
      <HistoricalCatchUpClient />
    </div>
  );
}
