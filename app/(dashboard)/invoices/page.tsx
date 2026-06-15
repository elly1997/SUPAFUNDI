import { InvoicesPageClient } from "@/components/invoices/invoices-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices & documents"
        description="Customer invoices (credit & partial payments), quotations, proforma, and delivery notes."
      />
      <InvoicesPageClient />
    </div>
  );
}
