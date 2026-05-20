import { redirect } from "next/navigation";

type Props = { params: { id: string } };

/** Canonical PO detail lives under inventory. */
export default function PurchaseOrderDetailRedirectPage({ params }: Props) {
  redirect(`/inventory/purchase-orders/${params.id}`);
}
