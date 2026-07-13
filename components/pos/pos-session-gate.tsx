"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { canBypassCashSession } from "@/lib/auth/roles";
import { fetchDrawerStatus } from "@/lib/api/cash-session-fetch";
import { useClientMounted } from "@/hooks/useClientMounted";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  outletId: string;
  sessionOverride: boolean;
  onSessionOverride: () => void;
  children: (ctx: {
    canSell: boolean;
    sessionOpen: boolean;
    isLoading: boolean;
  }) => React.ReactNode;
};

export function PosSessionGate({
  outletId,
  sessionOverride,
  onSessionOverride,
  children,
}: Props) {
  const mounted = useClientMounted();
  const role = useAuthStore((s) => s.session?.role ?? null);
  const canBypass = canBypassCashSession(role);

  const workingDate = useBusinessDateStore((s) => s.businessDate);

  const { data: drawer, isLoading } = useQuery({
    queryKey: ["drawer-status", outletId, workingDate],
    queryFn: () => fetchDrawerStatus(outletId, workingDate),
    enabled: mounted && !!outletId,
    staleTime: 90_000,
    refetchOnWindowFocus: false,
  });

  const priorBlocker = drawer?.priorDayBlocker ?? null;
  const dayReconciled = !!drawer?.reconciled;
  const sessionOpen = !!drawer?.session && !drawer.dateMismatch;
  const canSell =
    mounted &&
    !priorBlocker &&
    !dayReconciled &&
    (sessionOpen || canBypass || sessionOverride);

  return (
    <>
      {mounted && priorBlocker && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-destructive/15 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                Finish {priorBlocker.businessDate} before selling today
              </p>
              <p className="text-xs text-muted-foreground">{priorBlocker.message}</p>
            </div>
          </div>
          <Link
            href={priorBlocker.catchUpHref}
            className={cn(
              buttonVariants({ size: "sm" }),
              "min-h-11 shrink-0 rounded-full"
            )}
          >
            Open Catch-up
          </Link>
        </div>
      )}
      {mounted && !priorBlocker && dayReconciled && !isLoading && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-destructive/10 px-4 py-2.5">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Day reconciled</p>
              <p className="text-xs text-muted-foreground">
                Change the business date in the header to record new sales.
              </p>
            </div>
          </div>
        </div>
      )}
      {mounted &&
        !priorBlocker &&
        !dayReconciled &&
        !sessionOpen &&
        !isLoading && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5",
            canSell ? "bg-warning/10" : "bg-destructive/10"
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle
              className={cn(
                "mt-0.5 size-4 shrink-0",
                canSell ? "text-warning" : "text-destructive"
              )}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Open today’s cash drawer</p>
              <p className="text-xs text-muted-foreground">
                {canSell
                  ? "You can still sell with manager access."
                  : "Opening float is taken from yesterday’s reconciled closing — one tap to start the day."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CashSessionBar outletId={outletId} variant="inline" />
            {canBypass && !sessionOverride && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-full"
                onClick={onSessionOverride}
              >
                Sell anyway
              </Button>
            )}
          </div>
        </div>
      )}
      {children({ canSell, sessionOpen, isLoading })}
    </>
  );
}
