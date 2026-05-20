"use client";

import { format } from "date-fns";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/utils/iso-date";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  viewFrom: string;
  viewTo: string;
  onViewFromChange: (v: string) => void;
  onViewToChange: (v: string) => void;
  className?: string;
  compact?: boolean;
};

/** Recording date + optional list filter range for POS cash/sales. */
export function PosBusinessDateStrip({
  viewFrom,
  viewTo,
  onViewFromChange,
  onViewToChange,
  className,
  compact,
}: Props) {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const resetToToday = useBusinessDateStore((s) => s.resetToToday);

  const isBackdated = businessDate !== todayIso();

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border border-border bg-muted/30 p-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          label="Record on"
          value={businessDate}
          onChange={setBusinessDate}
          buttonClassName="h-8 min-w-0 flex-1 sm:min-w-[11rem]"
          align="start"
        />
        {isBackdated ? (
          <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
            Backdated
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(businessDate + "T12:00:00"), "EEE d MMM")}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => {
            resetToToday();
            const t = todayIso();
            onViewFromChange(t);
            onViewToChange(t);
          }}
        >
          <RotateCcw className="mr-1 size-3" />
          Today
        </Button>
      </div>
      {!compact ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-2">
          <DateRangePicker
            label="View range"
            from={viewFrom}
            to={viewTo}
            onFromChange={onViewFromChange}
            onToChange={onViewToChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mb-0.5 h-9 text-xs"
            onClick={() => {
              onViewFromChange(businessDate);
              onViewToChange(businessDate);
            }}
          >
            Match record date
          </Button>
        </div>
      ) : null}
    </div>
  );
}
