import type { CatchUpDayRow } from "@/lib/actions/catch-up";

export async function fetchCatchUpDays(
  outletId: string,
  fromDate: string,
  toDate: string
): Promise<CatchUpDayRow[]> {
  const params = new URLSearchParams({ outletId, fromDate, toDate });
  const res = await fetch(`/api/inventory/catch-up?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  const body = (await res.json()) as { days?: CatchUpDayRow[]; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Failed to load catch-up days");
  return body.days ?? [];
}
