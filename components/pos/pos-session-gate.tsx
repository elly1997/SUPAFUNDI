"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { canBypassCashSession } from "@/lib/auth/roles";
import { getOpenCashSession } from "@/lib/actions/cash-sessions";
import { useClientMounted } from "@/hooks/useClientMounted";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

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

  const { data: session, isLoading } = useQuery({
    queryKey: ["cash-session", outletId],
    queryFn: () => getOpenCashSession(outletId),
    enabled: mounted,
  });

  const sessionOpen = !!session;
  const canSell =
    mounted && (sessionOpen || canBypass || sessionOverride);

  return (
    <>
      {mounted && !sessionOpen && !isLoading && (
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
