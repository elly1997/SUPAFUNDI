"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  closeCashSession,
  getOpenCashSession,
  openCashSession,
} from "@/lib/actions/cash-sessions";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  outletId: string;
  variant?: "bar" | "inline";
};

export function CashSessionBar({ outletId, variant = "bar" }: Props) {
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [opening, setOpening] = useState("0");
  const [closing, setClosing] = useState("");
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery({
    queryKey: ["cash-session", outletId],
    queryFn: () => getOpenCashSession(outletId),
  });

  const openMut = useMutation({
    mutationFn: openCashSession,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Cash drawer opened");
        setOpenDialog(false);
        queryClient.invalidateQueries({ queryKey: ["cash-session", outletId] });
      } else toast.error(r.message);
    },
  });

  const closeMut = useMutation({
    mutationFn: closeCashSession,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Drawer closed. Variance: ${formatTzs(r.variance)}`);
        setCloseDialog(false);
        queryClient.invalidateQueries({ queryKey: ["cash-session", outletId] });
      } else toast.error(r.message);
    },
  });

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
      size="sm"
      variant="outline"
      className="h-9 shrink-0 rounded-full px-4"
      onClick={() => setCloseDialog(true)}
    >
      Close
    </Button>
  ) : (
    <Button
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
          </DialogHeader>
          <div className="space-y-2">
            <Label>Opening float (TZS)</Label>
            <Input
              type="number"
              min={0}
              className="h-11 rounded-xl"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full rounded-xl"
              disabled={openMut.isPending}
              onClick={() =>
                openMut.mutate({
                  outletId,
                  openingBalance: Number(opening) || 0,
                })
              }
            >
              {openMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Open drawer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Close cash drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Counted cash in drawer (TZS)</Label>
            <Input
              type="number"
              min={0}
              className="h-11 rounded-xl"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full rounded-xl"
              disabled={closeMut.isPending || !session}
              onClick={() =>
                session &&
                closeMut.mutate({
                  sessionId: session.id,
                  closingBalance: Number(closing) || 0,
                })
              }
            >
              {closeMut.isPending ? "Closing…" : "Close drawer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
