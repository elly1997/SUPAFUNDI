export const BANK_TRANSFER_REF_PREFIX = "XFR-";

export function newBankTransferRefs() {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const pairKey = `${BANK_TRANSFER_REF_PREFIX}${stamp}`;
  return {
    pairKey,
    outRef: `${pairKey}-OUT`,
    inRef: `${pairKey}-IN`,
  };
}

export function bankTransferPairKey(
  referenceNo: string | null | undefined
): string | null {
  if (!referenceNo) return null;
  const token = referenceNo.trim().split(/\s+/)[0] ?? "";
  if (!token.startsWith(BANK_TRANSFER_REF_PREFIX)) return null;
  return token.replace(/-OUT$|-IN$/, "");
}

export function isBankTransferOutflow(t: {
  transaction_type: string;
  reference_no?: string | null;
}): boolean {
  const token = (t.reference_no ?? "").trim().split(/\s+/)[0] ?? "";
  return t.transaction_type === "transfer" && token.endsWith("-OUT");
}

export function isCollectionOutflow(t: {
  transaction_type: string;
  reference_no?: string | null;
}): boolean {
  return t.transaction_type === "withdrawal" || isBankTransferOutflow(t);
}
