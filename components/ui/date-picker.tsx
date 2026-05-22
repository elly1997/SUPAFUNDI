"use client";

import { format, subDays } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CalendarGrid } from "@/components/ui/calendar-grid";
import { cn } from "@/lib/utils";
import { parseIsoDate, todayIso } from "@/lib/utils/iso-date";

export type DatePickerProps = {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabledDates?: string[];
  showPresets?: boolean;
  className?: string;
  buttonClassName?: string;
  align?: "start" | "end";
};

export function DatePicker({
  value,
  onChange,
  label,
  placeholder = "Pick date",
  minDate,
  maxDate,
  disabledDates,
  showPresets = true,
  className,
  buttonClassName,
  align = "start",
}: DatePickerProps) {
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

  const display = value
    ? format(parseIsoDate(value), "EEE, d MMM yyyy")
    : placeholder;

  const presets = [
    { label: "Today", iso: todayIso() },
    { label: "Yesterday", iso: format(subDays(new Date(), 1), "yyyy-MM-dd") },
  ];

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
        className={cn(
          "h-9 min-w-[10.5rem] justify-between gap-2 rounded-lg border-border bg-background px-3 font-normal",
          buttonClassName
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarDays className="size-4 shrink-0 text-primary" />
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
          aria-label={label ?? "Choose date"}
          className={cn(
            "absolute top-full z-50 mt-1 rounded-xl border border-border bg-card p-1 shadow-lg",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {showPresets ? (
            <div className="flex flex-wrap gap-1 border-b border-border p-2">
              {presets.map((p) => (
                <Button
                  key={p.iso}
                  type="button"
                  variant={value === p.iso ? "default" : "secondary"}
                  size="xs"
                  className="rounded-full"
                  onClick={() => {
                    onChange(p.iso);
                    setOpen(false);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          ) : null}
          <CalendarGrid
            value={value}
            minDate={minDate}
            maxDate={maxDate}
            disabledDates={disabledDates}
            onSelect={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
