"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  bulkRecategorizeProductsApi,
  fetchInventoryCategories,
} from "@/lib/api/inventory-catalog-fetch";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outletId: string;
  productIds: string[];
  onDone: () => void;
};

export function BulkRecategorizeDialog({
  open,
  onOpenChange,
  outletId,
  productIds,
  onDone,
}: Props) {
  const [categoryChoice, setCategoryChoice] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchInventoryCategories,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setCategoryChoice("");
    setNewCategoryName("");
  }, [open]);

  const mut = useMutation({
    mutationFn: async () => {
      if (categoryChoice === "__new__") {
        const name = newCategoryName.trim();
        if (!name) throw new Error("Enter a new category name");
        return bulkRecategorizeProductsApi({
          outletId,
          productIds,
          categoryName: name,
        });
      }
      if (categoryChoice === "" || categoryChoice === "__general__") {
        return bulkRecategorizeProductsApi({
          outletId,
          productIds,
          categoryId: null,
        });
      }
      return bulkRecategorizeProductsApi({
        outletId,
        productIds,
        categoryId: categoryChoice,
      });
    },
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(
        r.updated === 1
          ? "Moved 1 product to the new category"
          : `Moved ${r.updated} products to the new category`
      );
      onDone();
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not update categories");
    },
  });

  const canSubmit =
    productIds.length > 0 &&
    (categoryChoice === "__new__"
      ? newCategoryName.trim().length > 0
      : categoryChoice !== "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move to category</DialogTitle>
          <DialogDescription>
            Reassign {productIds.length} selected product
            {productIds.length === 1 ? "" : "s"} to a category. Lists and
            reports will group them under the new section.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-category">Category</Label>
              <select
                id="bulk-category"
                aria-label="Target category"
                className="flex min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={categoryChoice}
                onChange={(e) => setCategoryChoice(e.target.value)}
              >
                <option value="">Choose…</option>
                <option value="__general__">General (none)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New category…</option>
              </select>
            </div>
            {categoryChoice === "__new__" ? (
              <div className="space-y-2">
                <Label htmlFor="bulk-new-category">New category name</Label>
                <Input
                  id="bulk-new-category"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Plumbing"
                  autoFocus
                />
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || mut.isPending || isLoading}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Move {productIds.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
