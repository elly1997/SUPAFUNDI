"use client";

import { Store } from "lucide-react";
import { useEffect } from "react";
import { canSwitchOutlets } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { PosOutletOption } from "@/components/pos/pos-header";

type Props = {
  outlets: PosOutletOption[];
  className?: string;
  compact?: boolean;
};

export function PosOutletPicker({
  outlets,
  className,
  compact,
}: Props) {
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId);
  const session = useAuthStore((s) => s.session);
  const canSwitch = canSwitchOutlets(session?.role ?? null);

  useEffect(() => {
    if (activeOutletId && (!canSwitch || outlets.some((o) => o.id === activeOutletId))) {
      return;
    }
    const fromProfile = session?.outletId;
    const fallback = outlets[0]?.id;
    const next =
      (fromProfile && outlets.some((o) => o.id === fromProfile)
        ? fromProfile
        : null) ?? fallback;
    if (next) setActiveOutletId(next);
  }, [activeOutletId, canSwitch, outlets, session?.outletId, setActiveOutletId]);

  if (outlets.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-warning",
          className
        )}
      >
        No active outlets — add one in Settings
      </span>
    );
  }

  const value =
    activeOutletId && outlets.some((o) => o.id === activeOutletId)
      ? activeOutletId
      : outlets[0].id;
  const outletName =
    outlets.find((o) => o.id === value)?.name ?? outlets[0]?.name ?? "Outlet";

  return (
    <label
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm",
        className
      )}
    >
      <Store className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="sr-only">Outlet</span>
      {canSwitch ? (
        <select
          value={value}
          onChange={(e) => setActiveOutletId(e.target.value || null)}
          className={cn(
            "min-w-0 flex-1 cursor-pointer appearance-none border-0 bg-transparent font-semibold text-foreground focus:outline-none focus:ring-0",
            compact ? "text-xs" : "text-sm"
          )}
          aria-label="Active outlet"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id} className="bg-card text-foreground">
              {o.name}
              {o.is_active === false ? " (Inactive)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold text-foreground",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {outletName}
        </span>
      )}
    </label>
  );
}
