/** Build outlet prefix from name (e.g. "Main Store" → MAIN). */
export function outletInvoicePrefix(outletName: string): string {
  const slug = outletName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return slug.slice(0, 4) || "OUT";
}

/** Format: `{PREFIX}-{YEAR}-{SEQ}` e.g. MAIN-2026-00042 */
export function formatInvoiceNo(
  prefix: string,
  year: number,
  sequence: number
): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}
