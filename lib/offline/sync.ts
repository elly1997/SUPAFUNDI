import { offlineDb } from "./db";

/**
 * Background sync for queued offline sales — wire to Supabase in POS step.
 */
export async function syncOfflineQueue(): Promise<{ pending: number }> {
  const pending = await offlineDb.queuedSales.where("synced").equals(0).count();
  return { pending };
}
