/** Business calendar for Tanzania / East Africa (UTC+3). */
export const BUSINESS_TZ = "Africa/Nairobi";

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

/** Today's business date in East Africa Time (always YYYY-MM-DD). */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Add (or subtract) whole calendar days from a YYYY-MM-DD string. */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** UTC noon on a business date — use for sale_date, movement created_at, etc. */
export function isoDateToTimestamptz(iso: string): string {
  return `${iso}T12:00:00.000Z`;
}

export function resolveBusinessDate(iso?: string | null): string {
  return iso?.trim() || todayIso();
}

/** Extract YYYY-MM-DD from a business-day timestamptz (UTC noon anchor). */
export function businessDateFromTimestamptz(iso: string): string {
  return iso.slice(0, 10);
}

/** Inclusive UTC bounds for filtering payments/sales on a business date. */
export function businessDayBounds(iso: string): { from: string; to: string } {
  return {
    from: `${iso}T00:00:00.000Z`,
    to: `${iso}T23:59:59.999Z`,
  };
}
