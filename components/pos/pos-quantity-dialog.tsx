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
import { formatTzs } from "@/lib/utils/currency";
import type { PosProductRow } from "@/hooks/usePosProducts";

const QUICK_QTY = [1, 10, 50, 100] as const;

type Props = {
  product: PosProductRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => void;
};

export function PosQuantityDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const [qty, setQty] = useState("1");

  useEffect(() => {
    if (open) setQty("1");
  }, [open, product?.id]);

  if (!product) return null;

  const parsed = Math.max(1, Math.floor(Number(qty) || 1));
  const max = product.stockQty;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-left leading-snug">
            {product.name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {formatTzs(product.displayPrice)} / {product.unit} · {max} in stock
          </p>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {QUICK_QTY.map((n) => (
            <Button
              key={n}
              type="button"
              variant={parsed === n ? "default" : "outline"}
              className="h-12 rounded-xl font-bold"
              disabled={n > max}
              onClick={() => setQty(String(n))}
            >
              {n}
            </Button>
          ))}
        </div>

        <Input
          type="number"
          min={1}
          max={max}
          className="h-14 rounded-xl text-center text-2xl font-bold font-money tabular-nums"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />

        <DialogFooter className="gap-2 sm:flex-col">
          <Button
            className="h-12 w-full rounded-xl text-base font-semibold"
            disabled={parsed > max || parsed < 1}
            onClick={() => {
              onConfirm(parsed);
              onOpenChange(false);
            }}
          >
            Add {parsed} to cart
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
