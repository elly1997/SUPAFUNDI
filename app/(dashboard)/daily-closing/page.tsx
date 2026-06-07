import { Suspense } from "react";
import Link from "next/link";
import { DailyClosingClient } from "@/components/daily-closing/daily-closing-client";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listOutletsForOrg } from "@/lib/actions/inventory";
import { cn } from "@/lib/utils";

export default async function DailyClosingPage() {
  let outlets: Awaited<ReturnType<typeof listOutletsForOrg>> = [];
  try {
    outlets = await listOutletsForOrg();
  } catch {
    outlets = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily closing"
        description="Reconcile cash by business date. Opening balance carries from the prior reconciled day. Send the director report via WhatsApp."
        actions={
          <Link href="/pos" className={cn(buttonVariants())}>
            Open POS
          </Link>
        }
      />
      {outlets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add an outlet in Settings before reconciling.
        </p>
      ) : (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <DailyClosingClient outlets={outlets} />
        </Suspense>
      )}
    </div>
  );
}
