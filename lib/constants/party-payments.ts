/** Prefix for customer AR / credit-balance payments (daily closing + banking). */
export const CUSTOMER_AR_PAYMENT_PREFIX = "AR-";

/** Prefix for customer deposit receipts (prepaid balance, not invoice payment). */
export const CUSTOMER_DEPOSIT_PREFIX = "DEP-";

export function formatCustomerArReference(
  base: string,
  customRef?: string | null
): string {
  const custom = customRef?.trim();
  if (!custom) return `${CUSTOMER_AR_PAYMENT_PREFIX}${base}`;
  if (custom.startsWith(CUSTOMER_AR_PAYMENT_PREFIX)) return custom;
  return `${CUSTOMER_AR_PAYMENT_PREFIX}${custom}`;
}

export function formatCustomerDepositReference(
  base: string,
  customRef?: string | null
): string {
  const custom = customRef?.trim();
  if (!custom) return `${CUSTOMER_DEPOSIT_PREFIX}${base}`;
  if (custom.startsWith(CUSTOMER_DEPOSIT_PREFIX)) return custom;
  return `${CUSTOMER_DEPOSIT_PREFIX}${custom}`;
}

export function isCustomerArPaymentRef(ref: string | null | undefined): boolean {
  return String(ref ?? "").startsWith(CUSTOMER_AR_PAYMENT_PREFIX);
}

export function isCustomerDepositRef(ref: string | null | undefined): boolean {
  return String(ref ?? "").startsWith(CUSTOMER_DEPOSIT_PREFIX);
}
