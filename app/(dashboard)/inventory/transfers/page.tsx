import { TransfersPageClient } from "@/components/inventory/transfers-page-client";

export default function TransfersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock transfers</h1>
        <p className="text-sm text-muted-foreground">
          Send stock to another branch. Owner/manager approve & send from Inbox;
          destination confirms receipt.
        </p>
      </div>
      <TransfersPageClient />
    </div>
  );
}
