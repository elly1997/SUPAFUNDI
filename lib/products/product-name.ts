/** Normalized key for duplicate product name checks (case/space insensitive). */
export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
