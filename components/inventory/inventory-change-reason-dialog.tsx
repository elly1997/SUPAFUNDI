"use client";

import { useEffect, useState } from "react";
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

export type InventoryChangeKind = "quantity" | "costPrice" | "retailPrice";

const KIND_LABEL: Record<InventoryChangeKind, string> = {
  quantity: "Stock count / quantity",
  costPrice: "Buying price",
  retailPrice: "Selling price",
};

type Props = {
  open: boolean;
  productName: string;
  kind: InventoryChangeKind;
  previousValue: string;
  newValue: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  pending?: boolean;
};

export function InventoryChangeReasonDialog({
  open,
  productName,
  kind,
  previousValue,
  newValue,
  onConfirm,
  onCancel,
  pending,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open, productName, kind, previousValue, newValue]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record change reason</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <strong className="text-foreground">{productName}</strong> —{" "}
            {KIND_LABEL[kind]}
          </p>
          <p className="rounded-lg border border-border bg-surface-1/50 px-3 py-2 font-money">
            {previousValue} → {newValue}
          </p>
          <div className="space-y-2">
            <Label htmlFor="change-reason">Reason (optional)</Label>
            <Input
              id="change-reason"
              placeholder="e.g. stock count, supplier price change, market adjustment…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <p className="form-hint">
              Saved on the stock movement history for audits and statements.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
