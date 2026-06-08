"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  });

  const dayReconciled = !!drawer?.reconciled;
  const sessionOpen = !!drawer?.session && !drawer.dateMismatch;
  const canSell =
    mounted &&
    !dayReconciled &&
    (sessionOpen || canBypass || sessionOverride);

  return (
    <>
      {mounted && dayReconciled && !isLoading && (
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
      {mounted && !dayReconciled && !sessionOpen && !isLoading && (
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
              <p className="text-sm font-semibold">Cash drawer closed</p>
              <p className="text-xs text-muted-foreground">
                {canSell
                  ? "You can still sell with manager access."
                  : "Open the drawer before completing sales."}
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
                <ShieldCheck className="mr-1.5 size-3.5" />
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
