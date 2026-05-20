"use client";

import { format } from "date-fns";
import { CalendarRange, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/ui/calendar-grid";
import { cn } from "@/lib/utils";
import { parseIsoDate, todayIso } from "@/lib/utils/iso-date";

export type DateRangePickerProps = {
  from: string;
  to: string;
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  label?: string;
  className?: string;
  align?: "start" | "end";
};

export function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  label,
  className,
  align = "start",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const display =
    from && to
      ? `${format(parseIsoDate(from), "d MMM")} – ${format(parseIsoDate(to), "d MMM yyyy")}`
      : "Select range";

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      {label ? (
        <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? listId : undefined}
        className="h-9 min-w-[11rem] justify-between gap-2 rounded-lg border-border bg-background px-3 font-normal"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarRange className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm">{display}</span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </Button>
      {open ? (
        <div
          id={listId}
          role="dialog"
          aria-label={label ?? "Choose date range"}
          className={cn(
            "absolute top-full z-50 mt-1 w-auto rounded-xl border border-border bg-card p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          <p className="border-b border-border px-3 py-2 text-[10px] text-muted-foreground">
            Tap start date, then end date
          </p>
          <div className="flex flex-wrap gap-1 p-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="rounded-full"
              onClick={() => {
                const t = todayIso();
                onFromChange(t);
                onToChange(t);
                setOpen(false);
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              className="rounded-full"
              onClick={() => {
                onFromChange(from);
                onToChange(from);
                setOpen(false);
              }}
            >
              Single day
            </Button>
          </div>
          <CalendarGrid
            rangeFrom={from}
            rangeTo={to}
            onRangeSelect={(f, t) => {
              onFromChange(f);
              onToChange(t);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
