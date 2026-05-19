"use client";

import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SyncState = "synced" | "syncing" | "offline";

type SyncBadgeProps = {
  state?: SyncState;
  className?: string;
};

const META: Record<
  SyncState,
  { label: string; className: string; icon: typeof Cloud }
> = {
  synced: {
    label: "Synced",
    className: "bg-inflow/15 text-inflow",
    icon: Cloud,
  },
  syncing: {
    label: "Syncing",
    className: "bg-info/15 text-info",
    icon: Loader2,
  },
  offline: {
    label: "Offline",
    className: "bg-warning/15 text-warning",
    icon: CloudOff,
  },
};

export function SyncBadge({ state = "synced", className }: SyncBadgeProps) {
  const meta = META[state];
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        meta.className,
        className
      )}
      title={meta.label}
    >
      <Icon
        className={cn("size-3.5", state === "syncing" && "sync-pulse animate-spin")}
        aria-hidden
      />
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  );
}
