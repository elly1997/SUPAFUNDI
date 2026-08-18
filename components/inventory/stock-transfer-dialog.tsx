"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transferStockFromList } from "@/lib/actions/transfers";
import type { StockLevelRow } from "@/lib/actions/stock";

type OutletOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: StockLevelRow | null;
  fromOutletId: string | null;
  outlets: OutletOption[];
  onSuccess?: () => void;
};

export function StockTransferDialog({
  open,
  onOpenChange,
  row,
  fromOutletId,
  outlets,
  onSuccess,
}: Props) {
  const [toOutletId, setToOutletId] = useState("");
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!open || !row) return;
    setToOutletId("");
    setQty(Math.min(1, row.quantity > 0 ? row.quantity : 1));
  }, [open, row]);

  const transferMut = useMutation({
    mutationFn: transferStockFromList,
    onSuccess: (r) => {
      if (r.ok) {
        if ("pendingApproval" in r && r.pendingApproval) {
          toast.success(
            r.referenceNo
              ? `Transfer ${r.referenceNo} submitted — awaiting manager approval`
              : "Transfer submitted — awaiting manager approval"
          );
        } else {
          toast.success(
            r.referenceNo
              ? `Transfer ${r.referenceNo} sent — awaiting receipt at destination`
              : "Transfer sent — awaiting receipt at destination"
          );
        }
        onOpenChange(false);
        onSuccess?.();
      } else toast.error(r.message);
    },
  });

  const destinationOptions = outlets.filter((o) => o.id !== fromOutletId);
  const maxQty = row?.quantity ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-5" />
            Transfer stock
          </DialogTitle>
        </DialogHeader>
        {row ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!fromOutletId) {
                toast.error("Select a source outlet first");
                return;
              }
              if (!toOutletId) {
                toast.error("Select destination outlet");
                return;
              }
              if (qty <= 0 || qty > maxQty) {
                toast.error(`Enter quantity between 0 and ${maxQty}`);
                return;
              }
              transferMut.mutate({
                fromOutletId,
                toOutletId,
                lines: [{ productId: row.product_id, requestedQty: qty }],
              });
            }}
          >
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
              <p className="font-medium">{row.product_name}</p>
              <p className="text-xs text-muted-foreground">
                {row.code ?? "No SKU"} · Available here: {maxQty} {row.unit}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                From: {row.outlet_name}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Transfer to outlet</Label>
              <Select
                value={toOutletId}
                onValueChange={(v) => setToOutletId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination outlet" />
                </SelectTrigger>
                <SelectContent>
                  {destinationOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity to transfer</Label>
              <Input
                type="number"
                min={0.001}
                max={maxQty}
                step="any"
                className="font-money"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Managers and owners approve transfers before stock leaves the source
              outlet. Once approved and dispatched, the destination outlet
              confirms receipt.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !toOutletId ||
                  maxQty <= 0 ||
                  transferMut.isPending
                }
              >
                {transferMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Send transfer"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
