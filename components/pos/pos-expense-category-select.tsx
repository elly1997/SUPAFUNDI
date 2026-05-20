"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addExpenseCategory, listExpenseCategories } from "@/lib/actions/settings";

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

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });

  const addMut = useMutation({
    mutationFn: () => addExpenseCategory(newLabel),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Added “${r.category.label}”`);
        onValueChange(r.category.id);
        setNewLabel("");
        setAddOpen(false);
        queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      } else toast.error(r.message);
    },
  });

  return (
    <div className={className}>
      <div className="flex gap-2">
        <Select
          value={value}
          onValueChange={(v) => onValueChange(v ?? "misc")}
          disabled={isLoading}
        >
          <SelectTrigger className="h-9 flex-1 rounded-lg">
            <SelectValue placeholder={isLoading ? "Loading…" : "Category"} />
          </SelectTrigger>
          <SelectContent className="max-h-60" side="bottom" align="start">
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
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
