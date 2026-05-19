"use client";

import { format } from "date-fns";
import { CalendarDays, Store } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type ContextBarProps = {
  outlets: { id: string; name: string }[];
  outletId: string;
  onOutletChange: (id: string) => void;
  outletChangeDisabled?: boolean;
};

export function ContextBar({
  outlets,
  outletId,
  onOutletChange,
  outletChangeDisabled,
}: ContextBarProps) {
  const session = useAuthStore((s) => s.session);
  const businessDate = useBusinessDateStore((s) => s.businessDate);

  const orgName = session?.organizationName;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
      {orgName ? (
        <span className="font-medium text-foreground">{orgName}</span>
      ) : null}
      {orgName ? (
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-muted-foreground">
        <Store className="size-3.5 shrink-0" />
        <select
          value={outletId}
          disabled={outletChangeDisabled || outlets.length === 0}
          onChange={(e) => onOutletChange(e.target.value)}
          className="max-w-[10rem] truncate border-0 bg-transparent py-0 text-sm font-medium text-foreground focus:outline-none focus:ring-0"
          aria-label="Active outlet"
        >
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-muted-foreground">
        <CalendarDays className="size-3.5 shrink-0" />
        <input
          type="date"
          value={businessDate}
          onChange={(e) =>
            useBusinessDateStore.getState().setBusinessDate(e.target.value)
          }
          className="border-0 bg-transparent py-0 text-sm font-medium text-foreground focus:outline-none focus:ring-0"
          aria-label="Business date"
        />
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">
        {format(new Date(businessDate + "T12:00:00"), "EEE, d MMM yyyy")}
      </span>
    </div>
  );
}
