import { CashSessionsPageClient } from "@/components/finance/cash-sessions-page-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CashSessionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash drawer"
        description="Session history and variance. Open and close the register from POS."
        actions={
          <Link href="/pos" className={cn(buttonVariants(), "rounded-xl")}>
            Manage on POS
          </Link>
        }
      />
      <CashSessionsPageClient />
    </div>
  );
}
