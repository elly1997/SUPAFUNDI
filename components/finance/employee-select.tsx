"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { fetchEmployees } from "@/lib/api/payroll-fetch";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (employeeId: string) => void;
  disabled?: boolean;
  /** Outlet whose staff to list (defaults to the signed-in outlet). */
  outletId?: string | null;
  /** "org" = all outlets (owners/admin only). */
  scope?: "outlet" | "org";
  compact?: boolean;
  className?: string;
};

export function EmployeeSelect({
  value,
  onChange,
  disabled,
  scope = "outlet",
  outletId,
  compact,
  className,
}: Props) {
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees", scope, outletId ?? null],
    queryFn: () => fetchEmployees(scope, outletId),
    staleTime: 60_000,
  });

  const active = employees.filter((e) => e.is_active);
  const selected = active.find((e) => e.id === value);
  const labelFor = (e: (typeof active)[number]) =>
    scope === "org" && e.outlet_name ? `${e.full_name} · ${e.outlet_name}` : e.full_name;

  return (
    <div className={cn("space-y-1", !compact && "space-y-2", className)}>
      <Label className={compact ? "text-xs" : undefined}>Employee</Label>
      <Select
        value={value || undefined}
        onValueChange={(v) => onChange(v ?? "")}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className={compact ? "min-h-11 w-full" : undefined}>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select employee"}>
            {selected ? labelFor(selected) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {active.length === 0 && !isLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No staff registered for this outlet. Add them under Finance → Payroll.
            </div>
          ) : null}
          {active.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {labelFor(e)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
