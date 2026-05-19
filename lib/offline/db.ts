import Dexie, { type EntityTable } from "dexie";

/** Queued POS sale payload for offline sync (shape finalized with POS module). */
export type QueuedSale = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
  synced: boolean;
};

export class HardwarePosOfflineDb extends Dexie {
  queuedSales!: EntityTable<QueuedSale, "id">;

  constructor() {
    super("hardwarepos_offline");
    this.version(1).stores({
      queuedSales: "id, synced, createdAt",
    });
  }
}

export const offlineDb = new HardwarePosOfflineDb();

offlineDb.on("versionchange", () => {
  // Another tab upgraded the schema — avoid silent corruption on long-lived POS tabs.
  if (typeof window !== "undefined") {
    window.location.reload();
  }
});
