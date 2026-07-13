"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  closeCashSessionApi,
  fetchDrawerStatus,
  openCashSessionApi,
} from "@/lib/api/cash-session-fetch";
import {
  buildClosingWhatsAppApi,
  markClosingReportSentApi,
  reconcileDailyClosingApi,
} from "@/lib/api/daily-ops-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import Link from "next/link";

type Props = {
  outletId: string;
  variant?: "bar" | "inline";
  redirectAfterOpen?: string;
};

type EodStep = "count" | "reconcile" | "done";

type CloseResult = {
  variance: number;
  expected: number;
  businessDate: string;
  counted: number;
};

export function CashSessionBar({
  outletId,
  variant = "bar",
  redirectAfterOpen,
}: Props) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [eodStep, setEodStep] = useState<EodStep>("count");
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const [eodNotes, setEodNotes] = useState("");
  const [eodBusy, setEodBusy] = useState(false);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const queryClient = useQueryClient();
  const workingDate = useBusinessDateStore((s) => s.businessDate);

  const { data: drawer, isLoading } = useQuery({
    queryKey: ["drawer-status", outletId, workingDate],
    queryFn: () => fetchDrawerStatus(outletId, workingDate),
    enabled: !!outletId,
    staleTime: 90_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const session = drawer?.session ?? null;

  useEffect(() => {
    if (openDialog && drawer) {
      setOpening(String(Math.round(drawer.suggestedOpening)));
    }
  }, [openDialog, drawer]);

  useEffect(() => {
    if (closeDialog && drawer && eodStep === "count") {
      setClosing(String(Math.round(drawer.liveExpectedCash)));
    }
  }, [closeDialog, drawer, eodStep]);

  const resetEodDialog = () => {
    setCloseDialog(false);
    setEodStep("count");
    setCloseResult(null);
    setEodNotes("");
    setClosing("");
  };

  const openCloseWizard = () => {
    setEodStep("count");
    setCloseResult(null);
    setEodNotes("");
    setCloseDialog(true);
  };

  const invalidateDrawer = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["drawer-status", outletId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["cash-sessions-history"],
    });
    await queryClient.invalidateQueries({ queryKey: ["catch-up-days"] });
    await queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
  };

  const openMut = useMutation({
    mutationFn: openCashSessionApi,
    onSuccess: async (r) => {
      if (r.ok) {
        toast.success("Cash drawer opened");
        setOpenDialog(false);
        await invalidateDrawer();
        if (redirectAfterOpen) router.push(redirectAfterOpen);
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not open drawer");
    },
  });

  const closeMut = useMutation({
    mutationFn: closeCashSessionApi,
    onSuccess: async (r) => {
      if (r.ok) {
        await invalidateDrawer();
        setCloseResult({
          variance: r.variance,
          expected: r.expected,
          businessDate: r.businessDate,
          counted: Math.round(Number(closing) || r.expected),
        });
        setEodStep("reconcile");
        if (r.variance === 0) {
          toast.success("Drawer closed — matches expected");
        } else {
          toast.message(`Drawer closed · variance ${formatTzs(r.variance)}`);
        }
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not close drawer");
    },
  });

  const reconcileMut = useMutation({
    mutationFn: reconcileDailyClosingApi,
    onSuccess: async (r) => {
      if (r.ok) {
        toast.success("Day locked — reports updated");
        await invalidateDrawer();
        void queryClient.invalidateQueries({
          queryKey: ["reconciled-business-dates"],
        });
        setEodStep("done");
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Reconcile failed");
    },
  });

  const whatsappMut = useMutation({
    mutationFn: ({
      outletId: oid,
      businessDate: date,
    }: {
      outletId: string;
      businessDate: string;
    }) => buildClosingWhatsAppApi(oid, date),
    onSuccess: async (r, vars) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      if (r.whatsappUrl) {
        window.open(r.whatsappUrl, "_blank", "noopener,noreferrer");
        toast.success("Opening WhatsApp for director");
      } else {
        try {
          await navigator.clipboard.writeText(r.message);
          toast.message("Report copied — add director phone in Settings");
        } catch {
          toast.message(r.message.slice(0, 120) + "…");
        }
      }
      const marked = await markClosingReportSentApi(
        vars.outletId,
        vars.businessDate
      );
      if (marked.ok) {
        toast.success("Director report marked as sent");
        await invalidateDrawer();
      } else {
        toast.error(marked.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "WhatsApp failed");
    },
  });

  const handleCloseDrawer = () => {
    if (!session) return;
    const closingBalance = Number(closing);
    if (!Number.isFinite(closingBalance) || closingBalance < 0) {
      toast.error("Enter counted cash in drawer");
      return;
    }
    closeMut.mutate({
      sessionId: session.id,
      closingBalance,
      businessDate: session.business_date,
    });
  };

  const handleLockDay = () => {
    if (!closeResult || !outletId) return;
    reconcileMut.mutate({
      outletId,
      businessDate: closeResult.businessDate,
      countedClosing: closeResult.counted,
      notes: eodNotes.trim() || undefined,
    });
  };

  const handleCloseAndLock = async () => {
    if (!session) return;
    const closingBalance = Number(closing);
    if (!Number.isFinite(closingBalance) || closingBalance < 0) {
      toast.error("Enter counted cash in drawer");
      return;
    }
    setEodBusy(true);
    try {
      const closed = await closeCashSessionApi({
        sessionId: session.id,
        closingBalance,
        businessDate: session.business_date,
      });
      if (!closed.ok) {
        toast.error(closed.message);
        return;
      }
      await invalidateDrawer();
      const reconciled = await reconcileDailyClosingApi({
        outletId,
        businessDate: closed.businessDate,
        countedClosing: closingBalance,
        notes: eodNotes.trim() || undefined,
      });
      if (!reconciled.ok) {
        setCloseResult({
          variance: closed.variance,
          expected: closed.expected,
          businessDate: closed.businessDate,
          counted: closingBalance,
        });
        setEodStep("reconcile");
        toast.error(reconciled.message);
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["reconciled-business-dates"],
      });
      setCloseResult({
        variance: closed.variance,
        expected: closed.expected,
        businessDate: closed.businessDate,
        counted: closingBalance,
      });
      setEodStep("done");
      toast.success("Drawer closed and day locked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "End of day failed");
    } finally {
      setEodBusy(false);
    }
  };

  const handleOpen = (useSuggested = false) => {
    const openingBalance = useSuggested
      ? Math.round(drawer?.suggestedOpening ?? 0)
      : Number(opening);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error("Enter a valid opening float");
      return;
    }
    if (!outletId) {
      toast.error("Select an active outlet first");
      return;
    }
    if (drawer?.priorDayBlocker) {
      toast.error(drawer.priorDayBlocker.message);
      return;
    }
    openMut.mutate({
      outletId,
      openingBalance,
      businessDate: workingDate,
    });
  };

  const priorBlocker = drawer?.priorDayBlocker ?? null;

  const statusPill = (
    <span
      className={cn(
        "inline-flex min-h-11 max-w-full flex-col items-start gap-0.5 rounded-full px-3 py-2 text-xs font-semibold touch-manipulation sm:flex-row sm:items-center sm:gap-1.5",
        session && !drawer?.dateMismatch
          ? "bg-inflow-muted text-inflow"
          : drawer?.dateMismatch
            ? "bg-warning-muted text-warning"
            : "bg-warning-muted text-warning"
      )}
      title={
        drawer?.dateMismatch
          ? `Drawer open for ${session?.business_date} — close it before working on ${workingDate}`
          : undefined
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <Banknote className="size-3.5 shrink-0" />
        {isLoading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : session && !drawer?.dateMismatch ? (
          <>Drawer · {formatTzs(drawer?.liveExpectedCash ?? 0)}</>
        ) : drawer?.dateMismatch ? (
          <>Stale · {session?.business_date}</>
        ) : (
          "Drawer closed"
        )}
      </span>
      {session && !drawer?.dateMismatch && drawer ? (
        <span className="font-normal opacity-80 sm:ml-1">
          open {formatTzs(session.opening_balance)}
        </span>
      ) : null}
    </span>
  );

  const actionButton = drawer?.dateMismatch ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-11 shrink-0 rounded-full px-4"
      onClick={openCloseWizard}
    >
      Close {session?.business_date}
    </Button>
  ) : session ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-11 shrink-0 rounded-full px-4"
      onClick={openCloseWizard}
    >
      Close
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      className="min-h-11 shrink-0 rounded-full px-4"
      onClick={() => {
        if (priorBlocker) {
          toast.error(priorBlocker.message);
          return;
        }
        setOpenDialog(true);
      }}
      disabled={drawer?.reconciled}
    >
      Open day
    </Button>
  );

  return (
    <>
      {priorBlocker && variant === "inline" ? (
        <Link
          href={priorBlocker.catchUpHref}
          className={cn(
            buttonVariants({ size: "sm", variant: "destructive" }),
            "min-h-11 shrink-0 rounded-full"
          )}
        >
          Finish {priorBlocker.businessDate}
        </Link>
      ) : null}
      {variant === "bar" ? (
        <div className="flex items-center justify-between gap-2 border-b bg-card/80 px-4 py-2.5 backdrop-blur-sm">
          {statusPill}
          {actionButton}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {statusPill}
          {actionButton}
        </div>
      )}

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start today’s session</DialogTitle>
            <p className="text-sm text-muted-foreground">
              East Africa date:{" "}
              <span className="font-medium text-foreground">{workingDate}</span>
              {drawer?.eatToday && drawer.eatToday !== workingDate
                ? ` (today is ${drawer.eatToday})`
                : null}
            </p>
          </DialogHeader>
          {priorBlocker ? (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p>{priorBlocker.message}</p>
              <Link
                href={priorBlocker.catchUpHref}
                className={cn(buttonVariants({ size: "sm" }), "rounded-full")}
              >
                Go to Catch-up
              </Link>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleOpen(false);
              }}
            >
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  Opening float (yesterday’s closing)
                </p>
                <p className="font-money mt-1 text-2xl font-semibold text-inflow">
                  {formatTzs(drawer?.suggestedOpening ?? 0)}
                </p>
              </div>
              <Button
                type="button"
                className="h-11 w-full rounded-xl"
                disabled={openMut.isPending}
                onClick={() => handleOpen(true)}
              >
                {openMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Open with this float"
                )}
              </Button>
              <div className="space-y-2">
                <Label htmlFor="opening-float">Or adjust (TZS)</Label>
                <Input
                  id="opening-float"
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 rounded-xl font-money"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setOpenDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-11 flex-1 rounded-xl"
                  disabled={openMut.isPending || !outletId}
                >
                  {openMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Open with adjusted float"
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={closeDialog}
        onOpenChange={(open) => {
          if (!open) resetEodDialog();
          else openCloseWizard();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {eodStep === "count"
                ? "End of day — count cash"
                : eodStep === "reconcile"
                  ? "End of day — lock day"
                  : "Day complete"}
            </DialogTitle>
            {eodStep === "count" && drawer && session ? (
              <p className="text-sm text-muted-foreground">
                Expected in drawer:{" "}
                <span className="font-money font-semibold text-foreground">
                  {formatTzs(drawer.liveExpectedCash)}
                </span>
              </p>
            ) : closeResult ? (
              <p className="text-sm text-muted-foreground">
                {closeResult.businessDate} · counted{" "}
                <span className="font-money font-semibold text-foreground">
                  {formatTzs(closeResult.counted)}
                </span>
              </p>
            ) : null}
          </DialogHeader>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                eodStep === "count" ? "bg-primary/20 text-primary" : "bg-muted"
              )}
            >
              1 Count
            </span>
            <span>→</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                eodStep === "reconcile"
                  ? "bg-primary/20 text-primary"
                  : eodStep === "done"
                    ? "bg-inflow/20 text-inflow"
                    : "bg-muted"
              )}
            >
              2 Lock day
            </span>
          </div>

          {eodStep === "count" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleCloseDrawer();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="closing-count">Counted cash in drawer (TZS)</Label>
                <Input
                  id="closing-count"
                  type="number"
                  min={0}
                  step={1}
                  className="h-11 rounded-xl font-money"
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eod-notes">Notes (optional)</Label>
                <Input
                  id="eod-notes"
                  value={eodNotes}
                  onChange={(e) => setEodNotes(e.target.value)}
                  placeholder="Variance reason, handover…"
                />
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl btn-reconcile"
                  disabled={closeMut.isPending || eodBusy || !session}
                  onClick={() => void handleCloseAndLock()}
                >
                  {closeMut.isPending || eodBusy
                    ? "Finishing…"
                    : "Close drawer & lock day"}
                </Button>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  disabled={closeMut.isPending || !session}
                >
                  {closeMut.isPending ? "Closing…" : "Close drawer only"}
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {eodStep === "reconcile" && closeResult ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Expected</span>
                  <span className="font-money">{formatTzs(closeResult.expected)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-2">
                  <span className="text-muted-foreground">Counted</span>
                  <span className="font-money">{formatTzs(closeResult.counted)}</span>
                </div>
                <div className="mt-2 flex justify-between gap-2 border-t border-border/60 pt-2 font-semibold">
                  <span>Variance</span>
                  <span
                    className={cn(
                      "font-money",
                      closeResult.variance === 0
                        ? "text-inflow"
                        : closeResult.variance > 0
                          ? "text-inflow"
                          : "text-destructive"
                    )}
                  >
                    {formatTzs(closeResult.variance)}
                  </span>
                </div>
              </div>
              <p className="form-hint text-xs">
                Lock the day so reports and director WhatsApp use these figures.
                You cannot add sales to this date after locking.
              </p>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl btn-reconcile"
                  disabled={reconcileMut.isPending}
                  onClick={handleLockDay}
                >
                  {reconcileMut.isPending ? "Locking…" : "Lock day"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={() => {
                    toast.message(
                      "Day not locked — reconcile from header when ready"
                    );
                    resetEodDialog();
                  }}
                >
                  Skip for now
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {eodStep === "done" && closeResult ? (
            <div className="space-y-4">
              <p className="text-sm text-inflow">
                {closeResult.businessDate} is reconciled. Variance{" "}
                {formatTzs(closeResult.variance)}.
              </p>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button
                  type="button"
                  className="h-11 w-full rounded-xl"
                  disabled={whatsappMut.isPending}
                  onClick={() =>
                    whatsappMut.mutate({
                      outletId,
                      businessDate: closeResult.businessDate,
                    })
                  }
                >
                  {whatsappMut.isPending ? "Preparing…" : "Send WhatsApp report"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full rounded-xl"
                  onClick={resetEodDialog}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
