import { InvoicesPageClient } from "@/components/invoices/invoices-page-client";
import { PageHeader } from "@/components/ui/page-header";

export default function InvoicesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices & documents"
        description="Retail and wholesale invoices, quotations, proforma invoices, and delivery notes."
      />
      <InvoicesPageClient />
    </div>
  );
}
