import type { PaymentAccountRow } from "@/lib/actions/banking";

/** Payment methods that require a specific bank_accounts row. */
export function needsCollectionAccount(paymentMethod: string): boolean {
  return (
    paymentMethod === "mpesa" ||
    paymentMethod === "bank_transfer" ||
    paymentMethod === "cheque"
  );
}

export function collectionAccountRequiredMessage(): string {
  return "Select the bank or M-Pesa account for this payment (Finance → Banking).";
}

export function validateCollectionAccount(
  paymentMethod: string,
  bankAccountId?: string | null
): { ok: true } | { ok: false; message: string } {
  if (needsCollectionAccount(paymentMethod) && !bankAccountId) {
    return { ok: false, message: collectionAccountRequiredMessage() };
  }
  return { ok: true };
}

export function filterCollectionAccountsForMethod(
  accounts: PaymentAccountRow[],
  paymentMethod: string
): PaymentAccountRow[] {
  const active = accounts.filter((a) => a.is_active);
  if (paymentMethod === "bank_transfer" || paymentMethod === "cheque") {
    return active.filter((a) => a.account_type === "bank");
  }
  if (paymentMethod === "mpesa") {
    return active.filter(
      (a) =>
        a.account_type === "mpesa" ||
        a.account_type === "lipa" ||
        a.account_type === "till"
    );
  }
  return [];
}
