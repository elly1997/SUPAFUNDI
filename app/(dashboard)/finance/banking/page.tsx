import { BankingPageClient } from "@/components/finance/banking-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function BankingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Banking"
        description="Bank and mobile-money accounts, deposits, withdrawals, and reconciliation."
      />
      <BankingPageClient />
    </div>
  );
}
