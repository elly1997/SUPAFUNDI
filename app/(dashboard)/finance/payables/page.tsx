import { PayablesPageClient } from "@/components/finance/payables-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function PayablesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts payable"
        description="Supplier bills from on-account purchases and manual entries."
      />
      <PayablesPageClient />
    </div>
  );
}
