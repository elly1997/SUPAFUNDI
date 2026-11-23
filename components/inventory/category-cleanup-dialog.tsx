"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tags } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  applyCategoryCleanupApi,
  ensureHardwareCategoriesApi,
  fetchCategoryCleanupScan,
} from "@/lib/api/inventory-catalog-fetch";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outletId: string;
  onDone: () => void;
};

export function CategoryCleanupDialog({
  open,
  onOpenChange,
  outletId,
  onDone,
}: Props) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["category-cleanup", outletId],
    queryFn: () => fetchCategoryCleanupScan(outletId),
    enabled: open && !!outletId,
  });

  const suggestionList = data?.suggestions ?? [];
  const preview = useMemo(
    () => (data?.suggestions ?? []).slice(0, 40),
    [data?.suggestions]
  );

  const runMut = useMutation({
    mutationFn: async () => {
      await ensureHardwareCategoriesApi();

      const items = suggestionList.map((r) => ({
        productId: r.productId,
        suggestedName: r.suggestedName,
      }));
      if (items.length === 0) {
        return { updated: 0, empty: true as const };
      }

      let updated = 0;
      for (let i = 0; i < items.length; i += 500) {
        const chunk = items.slice(i, i + 500);
        const r = await applyCategoryCleanupApi({ outletId, items: chunk });
        if (!r.ok) throw new Error(r.message);
        updated += r.updated;
      }
      return { updated, empty: false as const };
    },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      if (r.empty) {
        toast.message("Nothing to move — no name-based matches left.");
      } else {
        toast.success(
          r.updated === 1
            ? "Recategorized 1 product"
            : `Recategorized ${r.updated} products`
        );
      }
      onDone();
      onOpenChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Recategorize failed"),
  });

  const busy = runMut.isPending || isLoading;
  const count = suggestionList.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="size-5 text-primary" />
            Recategorize stock
          </DialogTitle>
          <DialogDescription>
            Assigns every matching product in this outlet to a standard
            hardware category from its name (cement, plumbing, paint, steel,
            fasteners…). Creates any missing categories first.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-7 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
              <p className="font-medium text-foreground">
                {count} product{count === 1 ? "" : "s"} to update
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Scanned {data?.productCount ?? 0} active items ·{" "}
                {data?.uncategorizedCount ?? 0} uncategorized ·{" "}
                {data?.mismatchCount ?? 0} likely wrong
                {isFetching ? " · refreshing…" : ""}
              </p>
            </div>

            {count > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setShowPreview((v) => !v)}
              >
                {showPreview ? "Hide sample" : "Show sample moves"}
              </button>
            ) : null}

            {showPreview && preview.length > 0 ? (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2 text-xs">
                {preview.map((r) => (
                  <li key={r.productId} className="truncate text-muted-foreground">
                    <span className="text-foreground">{r.productName}</span>
                    {" · "}
                    {r.currentCategoryName} → {r.suggestedName}
                  </li>
                ))}
                {count > preview.length ? (
                  <li className="text-muted-foreground">
                    …and {count - preview.length} more
                  </li>
                ) : null}
              </ul>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              Items with no keyword match stay as they are — fix those later
              with select → Move to category.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || count === 0}
            onClick={() => {
              if (
                !window.confirm(
                  `Recategorize ${count} product${count === 1 ? "" : "s"} in this outlet?`
                )
              ) {
                return;
              }
              runMut.mutate();
            }}
          >
            {runMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Recategorize all
            {count > 0 ? ` (${count})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
