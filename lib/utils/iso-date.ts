/** Parse YYYY-MM-DD as local noon to avoid timezone drift. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** UTC noon on a business date — use for sale_date, movement created_at, etc. */
export function isoDateToTimestamptz(iso: string): string {
  return `${iso}T12:00:00.000Z`;
}

export function resolveBusinessDate(iso?: string | null): string {
  return iso?.trim() || todayIso();
}
