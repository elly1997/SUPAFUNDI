/** Display labels for PO payment / fulfilment tags. */
export type PoPaymentStatus = "unpaid" | "paid" | "partial";

export function isPoPaid(status: string | null | undefined): boolean {
  return status === "paid";
}

export function poPaymentTag(status: string | null | undefined): {
  label: string;
  variant: "paid" | "credit" | "partial";
} {
  if (status === "paid") {
    return { label: "Paid · completed", variant: "paid" };
  }
  if (status === "partial") {
    return { label: "Partially paid", variant: "partial" };
  }
  return { label: "Credit · unpaid", variant: "credit" };
}

export function poFulfilmentTag(status: string): string {
  if (status === "received") return "Received";
  if (status === "partial") return "Partial receipt";
  if (status === "sent") return "Sent";
  if (status === "draft") return "Draft";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const map: Record<string, string> = {
    cash: "Cash",
    mpesa: "M-Pesa",
    bank_transfer: "Bank transfer",
    on_account: "On account",
    cheque: "Cheque",
  };
  return map[method] ?? method;
}
