"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageCircle, Lock, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatchUpDayRow } from "@/lib/actions/catch-up";
import {
  buildClosingWhatsAppApi,
  markClosingReportSentApi,
  reconcileDailyClosingApi,
  reverseDailyClosingApi,
} from "@/lib/api/daily-ops-fetch";
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  outletId: string;
  day: CatchUpDayRow;
};

export function CatchUpCloseAndNotify({ outletId, day }: Props) {
  const queryClient = useQueryClient();
  const sessionRole = useAuthStore((s) => s.session?.role ?? null);
  const canReverse = canManageSettings(
    isUserRole(sessionRole ?? "") ? sessionRole : null
  );
  const [counted, setCounted] = useState(
    String(Math.round(day.sessionClosing ?? day.expectedCash))
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["catch-up-days"] });
    await queryClient.invalidateQueries({ queryKey: ["drawer-status"] });
    await queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
    await queryClient.invalidateQueries({
      queryKey: ["reconciled-business-dates"],
    });
  };

  const reconcileMut = useMutation({
    mutationFn: reconcileDailyClosingApi,
    onSuccess: async (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(`${day.businessDate} reconciled`);
      await invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Reconcile failed");
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const report = await buildClosingWhatsAppApi(outletId, day.businessDate);
      if (!report.ok) return report;
      if (report.whatsappUrl) {
        window.open(report.whatsappUrl, "_blank", "noopener,noreferrer");
      } else {
        await navigator.clipboard.writeText(report.message);
      }
      return markClosingReportSentApi(outletId, day.businessDate);
    },
    onSuccess: async (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success("Director report sent / marked");
      await invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Send failed");
    },
  });

  const reverseMut = useMutation({
    mutationFn: () =>
      reverseDailyClosingApi({
        outletId,
        businessDate: day.businessDate,
      }),
    onSuccess: async (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(`${day.businessDate} unlocked. You can edit and reconcile again.`);
      await invalidate();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Reverse failed");
    },
  });

  const reverseButton = canReverse && day.reconciled ? (
    <Button
      type="button"
      variant="outline"
      className="h-10 w-full"
      disabled={reverseMut.isPending}
      onClick={() => {
        const ok = window.confirm(
          `Reverse reconciliation for ${day.businessDate}? The day will unlock and any cash-count variance will be reversed in the books.`
        );
        if (ok) reverseMut.mutate();
      }}
    >
      {reverseMut.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <>
          <RotateCcw className="mr-2 size-4" />
          Reverse {day.businessDate}
        </>
      )}
    </Button>
  ) : null;

  if (day.reconciled && day.reportSent) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-inflow/30 bg-inflow/10 px-3 py-2 text-sm text-inflow">
          <CheckCircle2 className="size-4 shrink-0" />
          Reconciled and director report sent
        </div>
        {reverseButton}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Close day → director
      </p>
      <p className="text-xs text-muted-foreground">
        Expected cash{" "}
        <span className="font-money font-semibold text-foreground">
          {formatTzs(day.expectedCash)}
        </span>
        . Reconcile then send the same-day report to the director before
        opening a new day.
      </p>

      {!day.reconciled ? (
        <>
          {day.drawerStatus === "open" ? (
            <p className="text-xs text-warning">
              Close the drawer above first, then lock the day here.
            </p>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor={`counted-${day.businessDate}`} className="text-xs">
              Counted closing (TZS)
            </Label>
            <Input
              id={`counted-${day.businessDate}`}
              type="number"
              min={0}
              className="h-10 font-money"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
            />
          </div>
          <Button
            type="button"
            className="h-10 w-full"
            disabled={
              reconcileMut.isPending || day.drawerStatus === "open"
            }
            onClick={() => {
              const closing = Number(counted);
              if (!Number.isFinite(closing) || closing < 0) {
                toast.error("Enter counted closing cash");
                return;
              }
              reconcileMut.mutate({
                outletId,
                businessDate: day.businessDate,
                countedClosing: closing,
                openingBalance: day.sessionOpening ?? day.suggestedOpening,
              });
            }}
          >
            {reconcileMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Lock className="mr-2 size-4" />
                Reconcile {day.businessDate}
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            className="h-10 w-full"
            disabled={sendMut.isPending}
            onClick={() => sendMut.mutate()}
          >
            {sendMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <MessageCircle className="mr-2 size-4" />
                Send report to director
              </>
            )}
          </Button>
          {reverseButton}
        </>
      )}
    </div>
  );
}
