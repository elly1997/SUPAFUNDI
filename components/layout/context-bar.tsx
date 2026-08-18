"use client";

import { Store } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { useAuthStore } from "@/stores/authStore";
import { useGuardedBusinessDate } from "@/hooks/use-guarded-business-date";

type ContextBarProps = {
  outlets: { id: string; name: string }[];
  outletId: string;
  onOutletChange: (id: string) => void;
  outletChangeDisabled?: boolean;
  canSwitchOutlet?: boolean;
};

export function ContextBar({
  outlets,
  outletId,
  onOutletChange,
  outletChangeDisabled,
  canSwitchOutlet = true,
}: ContextBarProps) {
  const session = useAuthStore((s) => s.session);
  const { businessDate, onBusinessDateChange, reconciledDates } =
    useGuardedBusinessDate();

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
        {canSwitchOutlet ? (
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
        ) : (
          <span className="max-w-[10rem] truncate py-0 text-sm font-medium text-foreground">
            {outlets.find((o) => o.id === outletId)?.name ?? "Outlet"}
          </span>
        )}
      </span>
      <DatePicker
        value={businessDate}
        onChange={onBusinessDateChange}
        disabledDates={reconciledDates}
        showPresets
        buttonClassName="h-8 min-w-[9rem] border-0 bg-transparent shadow-none"
      />
    </div>
  );
}
