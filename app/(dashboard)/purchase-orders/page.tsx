import { redirect } from "next/navigation";

/** Canonical PO list lives under inventory. */
export default function PurchaseOrdersRedirectPage() {
  redirect("/inventory/purchase-orders");
}
