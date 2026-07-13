import { Suspense } from "react";
import { HistoricalCatchUpClient } from "@/components/inventory/historical-catch-up-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HistoricalCatchUpPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Catch-up & day close"
        description="Finish a prior business day here before a new East Africa day can open on POS: close the drawer, reconcile, and send the director report on this page."
        actions={
          <>
            <Link
              href="/daily-closing"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Daily closing
            </Link>
            <Link href="/pos" className={cn(buttonVariants({ size: "sm" }))}>
              POS
            </Link>
          </>
        }
      />
      <Suspense
        fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
      >
        <HistoricalCatchUpClient />
      </Suspense>
    </div>
  );
}
