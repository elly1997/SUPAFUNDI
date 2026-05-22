export async function fetchReconciledBusinessDates(
  outletId: string | null | undefined
): Promise<string[]> {
  const params = new URLSearchParams({
    fromDate: "2020-01-01",
  });
  if (outletId) params.set("outletId", outletId);
  const res = await fetch(`/api/daily-closing/reconciled-dates?${params}`, {
    credentials: "include",
  });
  const body = (await res.json()) as { dates?: string[]; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to load reconciled dates");
  }
  return body.dates ?? [];
}
