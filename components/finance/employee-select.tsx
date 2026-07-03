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

type Props = {
  value: string;
  onChange: (employeeId: string) => void;
  disabled?: boolean;
};

export function EmployeeSelect({ value, onChange, disabled }: Props) {
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const active = employees.filter((e) => e.is_active);

  return (
    <div className="space-y-2">
      <Label>Employee</Label>
      <Select
        value={value || undefined}
        onValueChange={(v) => onChange(v ?? "")}
        disabled={disabled || isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder={isLoading ? "Loading…" : "Select employee"} />
        </SelectTrigger>
        <SelectContent>
          {active.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
