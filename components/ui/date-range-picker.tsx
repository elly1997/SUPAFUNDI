"use client";

import { format } from "date-fns";
import { CalendarRange, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type PanelPosition = {
  top: number;
  left: number;
  width: number;
  placement: "bottom" | "top";
};

const PANEL_EST_HEIGHT = 420;
const VIEWPORT_PAD = 8;

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
  const [mounted, setMounted] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => setMounted(true), []);

  const updatePanelPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = Math.min(360, window.innerWidth - VIEWPORT_PAD * 2);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const placement =
      spaceBelow < PANEL_EST_HEIGHT && spaceAbove > spaceBelow
        ? "top"
        : "bottom";

    let left = align === "end" ? rect.right - panelWidth : rect.left;
    left = Math.max(
      VIEWPORT_PAD,
      Math.min(left, window.innerWidth - panelWidth - VIEWPORT_PAD)
    );

    setPanelPos({
      top: placement === "bottom" ? rect.bottom + 4 : rect.top - 4,
      left,
      width: panelWidth,
      placement,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    triggerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    const onReflow = () => updatePanelPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const display =
    from && to
      ? `${format(parseIsoDate(from), "d MMM")} – ${format(parseIsoDate(to), "d MMM yyyy")}`
      : "Select range";

  const panel =
    open && panelPos ? (
      <div
        id={listId}
        ref={panelRef}
        role="dialog"
        aria-label={label ?? "Choose date range"}
        className="fixed z-[200] max-h-[min(78dvh,32rem)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1 shadow-lg touch-pan-y"
        style={{
          left: panelPos.left,
          width: panelPos.width,
          ...(panelPos.placement === "bottom"
            ? { top: panelPos.top }
            : { bottom: window.innerHeight - panelPos.top }),
        }}
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
    ) : null;

  return (
    <div ref={rootRef} className={cn("relative w-full sm:w-auto", className)}>
      {label ? (
        <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      ) : null}
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? listId : undefined}
        className="min-h-11 w-full min-w-[11rem] justify-between gap-2 rounded-lg border-border bg-background px-3 font-normal sm:w-auto"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <CalendarRange className="size-4 shrink-0 text-primary" />
          <span className="truncate text-sm">{display}</span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 opacity-60 transition-transform",
            open && "rotate-180"
          )}
        />
      </Button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
