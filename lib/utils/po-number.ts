export function formatPoReference(prefix: string, year: number, sequence: number): string {
  return `PO-${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

export function formatTransferReference(
  prefix: string,
  year: number,
  sequence: number
): string {
  return `TRF-${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

export function outletCodePrefix(outletName: string): string {
  const slug = outletName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return slug.slice(0, 4) || "OUT";
}
