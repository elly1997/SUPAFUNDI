"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseIsoDate } from "@/lib/utils/iso-date";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export type CalendarGridProps = {
  value?: string;
  onSelect?: (iso: string) => void;
  rangeFrom?: string;
  rangeTo?: string;
  onRangeSelect?: (from: string, to: string) => void;
  minDate?: string;
  maxDate?: string;
  /** YYYY-MM-DD values that cannot be selected (e.g. reconciled days). */
  disabledDates?: string[];
  className?: string;
};

export function CalendarGrid({
  value,
  onSelect,
  rangeFrom,
  rangeTo,
  onRangeSelect,
  minDate,
  maxDate,
  disabledDates,
  className,
}: CalendarGridProps) {
  const selected = value ? parseIsoDate(value) : undefined;
  const [viewMonth, setViewMonth] = useState(
    () => selected ?? (rangeTo ? parseIsoDate(rangeTo) : new Date())
  );

  const min = minDate ? parseIsoDate(minDate) : undefined;
  const max = maxDate ? parseIsoDate(maxDate) : undefined;
  const disabledSet = useMemo(
    () => new Set(disabledDates ?? []),
    [disabledDates]
  );
  const from = rangeFrom ? parseIsoDate(rangeFrom) : undefined;
  const to = rangeTo ? parseIsoDate(rangeTo) : undefined;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  function isDisabled(day: Date) {
    const iso = format(day, "yyyy-MM-dd");
    if (disabledSet.has(iso)) return true;
    if (min && isBefore(day, min) && !isSameDay(day, min)) return true;
    if (max && isAfter(day, max) && !isSameDay(day, max)) return true;
    return false;
  }

  function inRange(day: Date) {
    if (!from || !to) return false;
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    return (
      (isSameDay(day, a) || isAfter(day, a)) &&
      (isSameDay(day, b) || isBefore(day, b))
    );
  }

  function handleDayClick(day: Date) {
    if (isDisabled(day)) return;
    const iso = format(day, "yyyy-MM-dd");
    if (onRangeSelect && rangeFrom && rangeTo) {
      if (rangeFrom === rangeTo && iso !== rangeFrom) {
        if (iso < rangeFrom) onRangeSelect(iso, rangeFrom);
        else onRangeSelect(rangeFrom, iso);
        return;
      }
      onRangeSelect(iso, iso);
      return;
    }
    onSelect?.(iso);
  }

  return (
    <div className={cn("w-[19.5rem] select-none p-2", className)}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Previous month"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Next month"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="py-1 text-[10px] font-semibold uppercase text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const outside = !isSameMonth(day, viewMonth);
          const selectedDay = selected && isSameDay(day, selected);
          const rangeMid = inRange(day);
          const rangeEdge =
            (from && isSameDay(day, from)) || (to && isSameDay(day, to));
          const disabled = isDisabled(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => handleDayClick(day)}
              className={cn(
                "h-10 w-10 rounded-lg text-sm font-medium transition-colors touch-manipulation",
                outside && "text-muted-foreground/40",
                !outside && !disabled && "hover:bg-muted",
                isToday(day) && !selectedDay && "ring-1 ring-primary/40",
                rangeMid && !selectedDay && "bg-primary/15",
                (selectedDay || rangeEdge) &&
                  "bg-primary text-primary-foreground hover:bg-primary",
                disabled && "pointer-events-none opacity-30"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
