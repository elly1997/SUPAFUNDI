import { StockPageClient } from "@/components/inventory/stock-page-client";

export default function StockPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <p className="text-sm text-muted-foreground">
          Quantity on hand and inventory value by outlet.
        </p>
      </div>
      <StockPageClient />
    </div>
  );
}
