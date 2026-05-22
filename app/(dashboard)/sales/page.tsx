import { SalesListClient } from "@/components/sales/sales-list-client";

export default function SalesListPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          Find sales by receipt or invoice number. Managers can void completed
          sales from the list or sale detail.
        </p>
      </div>
      <SalesListClient />
    </div>
  );
}
