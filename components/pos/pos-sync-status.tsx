"use client";

import { SyncBadge } from "@/components/layout/sync-badge";
import { useClientMounted } from "@/hooks/useClientMounted";
import { usePosSync } from "@/hooks/usePosSync";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function PosSyncStatus({ className }: Props) {
  const mounted = useClientMounted();
  const { syncState, pending } = usePosSync();

  if (!mounted) {
    return (
      <SyncBadge
        state="synced"
        className={cn("rounded-full px-2.5 py-1", className)}
      />
    );
  }

  return (
    <span
      title={
        pending > 0 ? `${pending} sale(s) waiting to sync` : undefined
      }
    >
      <SyncBadge
        state={syncState}
        className={cn("rounded-full px-2.5 py-1", className)}
      />
    </span>
  );
}
