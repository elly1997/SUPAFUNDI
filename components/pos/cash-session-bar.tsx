"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  fetchOpenCashSession,
  openCashSessionApi,
} from "@/lib/api/cash-session-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  outletId: string;
  variant?: "bar" | "inline";
  /** After opening, navigate here (e.g. from finance cash-sessions page). */
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
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("");
  const queryClient = useQueryClient();
  const businessDate = useBusinessDateStore((s) => s.businessDate);

  const { data: session, isLoading } = useQuery({
    queryKey: ["cash-session", outletId],
    queryFn: () => fetchOpenCashSession(outletId),
    enabled: !!outletId,
  });

  const openMut = useMutation({
    mutationFn: openCashSessionApi,
    onSuccess: async (r) => {
      if (r.ok) {
        toast.success("Cash drawer opened");
        setOpenDialog(false);
        await queryClient.invalidateQueries({ queryKey: ["cash-session", outletId] });
        await queryClient.invalidateQueries({ queryKey: ["cash-sessions-history"] });
        if (redirectAfterOpen) {
          router.push(redirectAfterOpen);
        }
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
        toast.success(`Drawer closed. Variance: ${formatTzs(r.variance)}`);
        setCloseDialog(false);
        setClosing("");
        await queryClient.invalidateQueries({ queryKey: ["cash-session", outletId] });
        await queryClient.invalidateQueries({ queryKey: ["cash-sessions-history"] });
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
    openMut.mutate({ outletId, openingBalance, businessDate });
  };

  const statusPill = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold touch-manipulation",
        session
          ? "bg-inflow-muted text-inflow"
          : "bg-warning-muted text-warning"
      )}
    >
      <Banknote className="size-3.5 shrink-0" />
      {isLoading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : session ? (
        <>Open · {formatTzs(session.opening_balance)}</>
      ) : (
        "Drawer closed"
      )}
    </span>
  );

  const actionButton = session ? (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 shrink-0 rounded-full px-4"
      onClick={() => setCloseDialog(true)}
    >
      Close
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      className="h-9 shrink-0 rounded-full px-4"
      onClick={() => setOpenDialog(true)}
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
              Business date: <span className="font-medium text-foreground">{businessDate}</span>
            </p>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleOpen();
            }}
          >
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
                businessDate,
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
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => setCloseDialog(false)}
              >
                Cancel
              </Button>
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
