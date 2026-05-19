"use client";

import { useCallback, useEffect, useState } from "react";
import { syncOfflineQueue } from "@/lib/offline/sync";
import type { SyncState } from "@/components/layout/sync-badge";

export function usePosSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPending = useCallback(async () => {
    try {
      const { pending: count } = await syncOfflineQueue();
      setPending(count);
    } catch {
      setPending(0);
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      void refreshPending();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void refreshPending();
    const interval = setInterval(() => void refreshPending(), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(interval);
    };
  }, [refreshPending]);

  const syncState: SyncState = !online
    ? "offline"
    : syncing || pending > 0
      ? "syncing"
      : "synced";

  const runSync = useCallback(async () => {
    if (!online) return;
    setSyncing(true);
    try {
      await syncOfflineQueue();
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [online, refreshPending]);

  return { syncState, pending, online, runSync };
}
