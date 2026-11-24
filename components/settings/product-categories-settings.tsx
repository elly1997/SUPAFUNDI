"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryCleanupDialog } from "@/components/inventory/category-cleanup-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createProductCategory,
  deleteProductCategory,
  listProductCategoriesWithCounts,
  renameProductCategory,
} from "@/lib/actions/inventory";
import { ensureHardwareCategoriesApi } from "@/lib/api/inventory-catalog-fetch";
import { useAuthStore } from "@/stores/authStore";

export function ProductCategoriesSettings() {
  const queryClient = useQueryClient();
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["product-categories-settings"],
    queryFn: () => listProductCategoriesWithCounts(),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["product-categories-settings"],
    });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["pos-categories"] });
  };

  const addMut = useMutation({
    mutationFn: () => createProductCategory(newName),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Category added");
        setNewName("");
        refresh();
      } else toast.error(r.message);
    },
  });

  const renameMut = useMutation({
    mutationFn: (v: { id: string; name: string }) =>
      renameProductCategory(v.id, v.name),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Category renamed");
        setEditingId(null);
        refresh();
      } else toast.error(r.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProductCategory(id),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Category deleted");
        refresh();
      } else toast.error(r.message);
    },
  });

  const seedMut = useMutation({
    mutationFn: ensureHardwareCategoriesApi,
    onSuccess: (r) => {
      toast.success(
        r.created > 0
          ? `Added ${r.created} standard categor${r.created === 1 ? "y" : "ies"}`
          : "All standard categories already exist"
      );
      refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not seed categories"),
  });

  const categories = data?.categories ?? [];
  const uncategorized = data?.uncategorizedCount ?? 0;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Products in a deleted category move to General. Use Recategorize
              to sort stock by name automatically.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={seedMut.isPending}
              onClick={() => seedMut.mutate()}
            >
              {seedMut.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              Add standard set
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!outletId}
              onClick={() => setCleanupOpen(true)}
            >
              <Tags className="mr-1.5 size-3.5" />
              Recategorize stock
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {uncategorized > 0 ? (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              {uncategorized} active product{uncategorized === 1 ? "" : "s"}{" "}
              have no category — industry reports group them as General.
            </p>
          ) : null}

          {isLoading ? (
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
          ) : categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No categories yet. Add the standard hardware set or create your
              own.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {categories.map((c) => {
                const editing = editingId === c.id;
                return (
                  <li
                    key={c.id}
                    className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2"
                  >
                    {editing ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-9 min-w-[10rem] flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              renameMut.mutate({ id: c.id, name: editName });
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Save name"
                          disabled={renameMut.isPending}
                          onClick={() =>
                            renameMut.mutate({ id: c.id, name: editName })
                          }
                        >
                          <Check className="size-4 text-inflow" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel rename"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {c.name}
                        </span>
                        <span className="font-money text-xs text-muted-foreground">
                          {c.productCount} item{c.productCount === 1 ? "" : "s"}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Rename ${c.name}`}
                          onClick={() => {
                            setEditingId(c.id);
                            setEditName(c.name);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Delete ${c.name}`}
                          disabled={deleteMut.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                c.productCount > 0
                                  ? `Delete “${c.name}”? ${c.productCount} product${c.productCount === 1 ? "" : "s"} will become uncategorized (General).`
                                  : `Delete “${c.name}”?`
                              )
                            ) {
                              deleteMut.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="new-product-cat">New category</Label>
              <Input
                id="new-product-cat"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Roofing"
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
              disabled={addMut.isPending || newName.trim().length < 2}
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

      {outletId ? (
        <CategoryCleanupDialog
          open={cleanupOpen}
          onOpenChange={setCleanupOpen}
          outletId={outletId}
          onDone={refresh}
        />
      ) : null}
    </>
  );
}
