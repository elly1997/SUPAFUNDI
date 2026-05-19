const TZ_FORMATTER = new Intl.NumberFormat("en-TZ", {
  style: "currency",
  currency: "TZS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatTzs(amount: number): string {
  return TZ_FORMATTER.format(amount);
}

/** East Africa Time (UTC+3) for display strings. */
export const EAST_AFRICA_TZ = "Africa/Nairobi";

export function formatDateTimeEAT(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: EAST_AFRICA_TZ,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
