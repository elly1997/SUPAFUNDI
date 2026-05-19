import { SalesListClient } from "@/components/sales/sales-list-client";
import { listRecentSales } from "@/lib/actions/sales";

export default async function SalesListPage() {
  let sales: Awaited<ReturnType<typeof listRecentSales>> = [];
  try {
    sales = await listRecentSales(100);
  } catch {
    sales = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Invoices and payment history for your organization.
        </p>
      </div>
      <SalesListClient sales={sales} />
    </div>
  );
}
