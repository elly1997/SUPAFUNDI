"use client";

import { format } from "date-fns";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/utils/iso-date";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  className?: string;
};

/** Business date for recording expenses and stock purchases on POS. */
export function PosRecordDate({ className }: Props) {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const resetToToday = useBusinessDateStore((s) => s.resetToToday);
  const isBackdated = businessDate !== todayIso();

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <DatePicker
        label="Record on"
        value={businessDate}
        onChange={setBusinessDate}
        showPresets={false}
        buttonClassName="min-h-11 min-w-0 flex-1"
        align="start"
      />
      {isBackdated ? (
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
          Backdated
        </span>
      ) : (
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          {format(new Date(businessDate + "T12:00:00"), "EEE d MMM")}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-10 shrink-0 px-2 text-xs"
        onClick={resetToToday}
      >
        <RotateCcw className="mr-1 size-3" />
        Today
      </Button>
    </div>
  );
}
