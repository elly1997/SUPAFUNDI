"use client";

import { format } from "date-fns";
import { AlertTriangle, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { useGuardedBusinessDate } from "@/hooks/use-guarded-business-date";
import { useClientMounted } from "@/hooks/useClientMounted";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/utils/iso-date";
import { useBusinessDateStore } from "@/stores/businessDateStore";

function formatDay(iso: string) {
  return format(new Date(iso + "T12:00:00"), "EEE d MMM yyyy");
}

/** Sticky context when business date is not today or the day is reconciled. */
export function BusinessDateBanner() {
  const mounted = useClientMounted();
  const today = todayIso();
  const resetToToday = useBusinessDateStore((s) => s.resetToToday);
  const {
    businessDate,
    isCurrentDateReconciled,
    reconciledDates,
    onBusinessDateChange,
  } = useGuardedBusinessDate();
  const autoSwitched = useRef(false);

  useEffect(() => {
    if (!mounted || autoSwitched.current || !isCurrentDateReconciled) return;
    const reconciledSet = new Set(reconciledDates);
    if (!reconciledSet.has(today)) {
      autoSwitched.current = true;
      resetToToday();
      toast.message(
        `Switched to today — ${formatDay(businessDate)} is already reconciled.`
      );
    }
  }, [
    mounted,
    isCurrentDateReconciled,
    businessDate,
    today,
    reconciledDates,
    resetToToday,
  ]);

  if (!mounted) return null;

  if (isCurrentDateReconciled) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm",
          "border-destructive/30 bg-destructive/10"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-semibold">{formatDay(businessDate)}</span> is
            reconciled — pick another business date to record sales or payments.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={() => {
            if (!reconciledDates.includes(today)) {
              onBusinessDateChange(today);
            }
          }}
          disabled={reconciledDates.includes(today)}
        >
          Use today
        </Button>
      </div>
    );
  }

  if (businessDate < today) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm",
          "border-warning/30 bg-warning/10"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-warning" />
          <p>
            Recording on{" "}
            <span className="font-semibold">{formatDay(businessDate)}</span> —
            close the drawer and reconcile when done.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/inventory/catch-up"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "h-8")}
          >
            Catch-up
          </Link>
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => resetToToday()}
          >
            Switch to today
          </Button>
        </div>
      </div>
    );
  }

  if (businessDate > today) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm",
          "border-info/30 bg-info/10"
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-info" />
          <p>
            Future business date{" "}
            <span className="font-semibold">{formatDay(businessDate)}</span> —
            sales will post to that day.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => resetToToday()}
        >
          Use today
        </Button>
      </div>
    );
  }

  return null;
}
