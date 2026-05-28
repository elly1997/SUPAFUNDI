/** Escape a value for CSV (RFC-style). */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function csvDocument(
  header: string[],
  rows: unknown[][]
): string {
  return [csvRow(header), ...rows.map((r) => csvRow(r))].join("\n");
}
