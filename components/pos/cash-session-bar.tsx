"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  outletId: string;
  variant?: "bar" | "inline";
  redirectAfterOpen?: string;
};

export function CashSessionBar({
  outletId,
  variant = "bar",
  redirectAfterOpen,
}: Props) {
  const router = useRouter();
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const queryClient = useQueryClient();
  const workingDate = useBusinessDateStore((s) => s.businessDate);

  const { data: drawer, isLoading } = useQuery({
    queryKey: ["drawer-status", outletId, workingDate],
    queryFn: () => fetchDrawerStatus(outletId, workingDate),
    enabled: !!outletId,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });

  const session = drawer?.session ?? null;

  useEffect(() => {
    if (openDialog && drawer) {
      setOpening(String(Math.round(drawer.suggestedOpening)));
    }
  }, [openDialog, drawer]);

  useEffect(() => {
    if (closeDialog && drawer) {
      setClosing(String(Math.round(drawer.liveExpectedCash)));
    }
  }, [closeDialog, drawer]);

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
        const varianceMsg =
          r.variance === 0
            ? "Drawer closed — matches expected cash"
            : `Drawer closed · variance ${formatTzs(r.variance)}`;
        toast.success(varianceMsg);
        setCloseDialog(false);
        setClosing("");
        await invalidateDrawer();
        if (r.needsReconcile) {
          toast.message("Reconcile this day to lock reports and notify directors", {
            action: {
              label: "Reconcile",
              onClick: () =>
                router.push(
                  `/daily-closing?date=${r.businessDate}&counted=${Math.round(Number(closing) || r.expected)}`
                ),
            },
          });
        }
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not close drawer");
    },
  });

  const handleOpen = () => {
    const openingBalance = Number(opening);
    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      toast.error("Enter a valid opening float");
      return;
    }
    if (!outletId) {
      toast.error("Select an active outlet first");
      return;
    }
    openMut.mutate({
      outletId,
      openingBalance,
      businessDate: workingDate,
    });
  };

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
      onClick={() => setCloseDialog(true)}
    >
      Close {session?.business_date}
    </Button>
  ) : session ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-11 shrink-0 rounded-full px-4"
      onClick={() => setCloseDialog(true)}
    >
      Close
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      className="min-h-11 shrink-0 rounded-full px-4"
      onClick={() => setOpenDialog(true)}
      disabled={drawer?.reconciled}
    >
      Open drawer
    </Button>
  );

  return (
    <>
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
            <DialogTitle>Open cash drawer</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Business date:{" "}
              <span className="font-medium text-foreground">{workingDate}</span>
            </p>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleOpen();
            }}
          >
            {drawer ? (
              <p className="form-hint text-xs">
                Suggested opening (prior reconciled closing):{" "}
                <span className="font-money font-semibold text-foreground">
                  {formatTzs(drawer.suggestedOpening)}
                </span>
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="opening-float">Opening float (TZS)</Label>
              <Input
                id="opening-float"
                type="number"
                min={0}
                step={1}
                className="h-11 rounded-xl font-money"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                autoFocus
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
                  "Open drawer"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close cash drawer</DialogTitle>
            {drawer && session ? (
              <p className="text-sm text-muted-foreground">
                Expected in drawer:{" "}
                <span className="font-money font-semibold text-foreground">
                  {formatTzs(drawer.liveExpectedCash)}
                </span>
              </p>
            ) : null}
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
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
            <p className="form-hint text-xs leading-snug">
              After closing, reconcile the day so variance appears on the director
              report and WhatsApp.
            </p>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Link
                href="/daily-closing"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-11 rounded-xl"
                )}
                onClick={() => setCloseDialog(false)}
              >
                Reconcile
              </Link>
              <Button
                type="submit"
                className="h-11 flex-1 rounded-xl"
                disabled={closeMut.isPending || !session}
              >
                {closeMut.isPending ? "Closing…" : "Close drawer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
