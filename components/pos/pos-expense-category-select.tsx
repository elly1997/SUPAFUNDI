"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
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
import { addExpenseCategory, listExpenseCategories } from "@/lib/actions/settings";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants/expense-categories";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
};

export function PosExpenseCategorySelect({
  value,
  onValueChange,
  className,
}: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const queryClient = useQueryClient();

  const { data: fetched = [], isLoading, isError } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
    staleTime: 60_000,
  });

  const categories = useMemo(
    () => (fetched.length > 0 ? fetched : DEFAULT_EXPENSE_CATEGORIES),
    [fetched]
  );

  const displayValue =
    categories.some((c) => c.id === value) ? value : categories[0]?.id ?? "misc";

  const addMut = useMutation({
    mutationFn: () => addExpenseCategory(newLabel),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Added “${r.category.label}”`);
        onValueChange(r.category.id);
        setNewLabel("");
        setAddOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      } else toast.error(r.message);
    },
  });

  return (
    <div className={cn("flex gap-2", className)}>
      <select
        aria-label="Expense category"
        className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-surface-1 px-2.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        value={displayValue}
        disabled={isLoading && categories.length === 0}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-lg"
        aria-label="Add expense category"
        onClick={() => setAddOpen(true)}
      >
        <Plus className="size-4" />
      </Button>
      {isError && (
        <span className="sr-only">Using default categories</span>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New expense category</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Cleaning supplies"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || newLabel.trim().length < 2}
            >
              {addMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Add"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
