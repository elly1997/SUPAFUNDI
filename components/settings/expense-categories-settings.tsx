"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/constants/expense-categories";
import {
  addExpenseCategory,
  listExpenseCategories,
  removeExpenseCategory,
} from "@/lib/actions/settings";

export function ExpenseCategoriesSettings() {
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
        setNewLabel("");
        queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      } else toast.error(r.message);
    },
  });

  const removeMut = useMutation({
    mutationFn: removeExpenseCategory,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Category removed");
        queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Expense categories</CardTitle>
        <CardDescription>
          Categories appear in POS cash out and on the expenses page. Built-in
          categories cannot be removed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const isBuiltIn = DEFAULT_EXPENSE_CATEGORIES.some(
                (d) => d.id === c.id
              );
              return (
                <li
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-sm"
                >
                  <span>{c.label}</span>
                  {!isBuiltIn && (
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      aria-label={`Remove ${c.label}`}
                      onClick={() => removeMut.mutate(c.id)}
                      disabled={removeMut.isPending}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label htmlFor="new-expense-cat">New category</Label>
            <Input
              id="new-expense-cat"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Transport, Tea"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMut.mutate();
                }
              }}
            />
          </div>
          <Button
            type="button"
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || newLabel.trim().length < 2}
          >
            {addMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-2 size-4" />
                Add
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
