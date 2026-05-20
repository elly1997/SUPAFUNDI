"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearAllCatalogProducts } from "@/lib/api/inventory-catalog-fetch";

const CONFIRM_TEXT = "DELETE ALL";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productCount: number;
  onCleared?: () => void;
};

export function ProductsClearAllDialog({
  open,
  onOpenChange,
  productCount,
  onCleared,
}: Props) {
  const [confirm, setConfirm] = useState("");

  const clearMut = useMutation({
    mutationFn: clearAllCatalogProducts,
    onSuccess: (res) => {
      toast.success(`Removed ${res.deleted} product(s) from the catalogue.`);
      setConfirm("");
      onOpenChange(false);
      onCleared?.();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Clear failed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirm("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Clear all items</DialogTitle>
          <DialogDescription>
            Permanently deletes all {productCount} product(s), stock rows, and
            price records for your organization. Sales history keeps line names
            but loses product links. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="clear-confirm">
            Type <strong>{CONFIRM_TEXT}</strong> to confirm
          </Label>
          <Input
            id="clear-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRM_TEXT}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={
              confirm !== CONFIRM_TEXT ||
              clearMut.isPending ||
              productCount === 0
            }
            onClick={() => clearMut.mutate()}
          >
            {clearMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 size-4" />
            )}
            Clear all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
