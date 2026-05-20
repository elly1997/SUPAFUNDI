"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Trash2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteDuplicateProducts,
  fetchDuplicateProducts,
} from "@/lib/api/inventory-duplicates-fetch";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ProductsDuplicatesDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["product-duplicates"],
    queryFn: fetchDuplicateProducts,
    enabled: open,
  });

  const groups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const totalDuplicates = data?.totalDuplicates ?? 0;

  const recommendedRemoveIds = useMemo(
    () =>
      groups.flatMap((g) =>
        g.entries.filter((e) => !e.keepRecommended).map((e) => e.id)
      ),
    [groups]
  );

  const deleteMut = useMutation({
    mutationFn: deleteDuplicateProducts,
    onSuccess: (res) => {
      if (res.deleted === 0 && res.errors.length === 0) {
        toast.info("Nothing to delete.");
        return;
      }
      if (res.errors.length > 0) {
        toast.warning(
          `Removed ${res.deleted} duplicate(s). ${res.errors.length} could not be deleted (linked to purchases or returns).`
        );
      } else {
        toast.success(`Removed ${res.deleted} duplicate product(s).`);
      }
      setSelected(new Set());
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      if (res.deleted > 0 && res.errors.length === 0) {
        onOpenChange(false);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllRecommended = () => {
    setSelected(new Set(recommendedRemoveIds));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="size-5" />
            Duplicate products
          </DialogTitle>
          <DialogDescription>
            Items sharing the same name (ignoring capital letters). We keep one
            per name — preferring stock on hand, then the oldest record. Delete
            the rest to clean your catalogue.
          </DialogDescription>
        </DialogHeader>

        {isLoading || isFetching ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : totalDuplicates === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No duplicate names found. Each product name is unique.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-warning">
              {totalDuplicates} extra row(s) across {groups.length} name
              {groups.length === 1 ? "" : "s"}.
            </p>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto">
              {groups.map((g) => (
                <div key={g.nameKey} className="rounded-lg border">
                  <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">
                    {g.displayName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({g.entries.length} copies)
                    </span>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Code</TableHead>
                        <TableHead>Stock qty</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.entries.map((e) => (
                        <TableRow
                          key={e.id}
                          className={cn(
                            e.keepRecommended && "bg-inflow/5"
                          )}
                        >
                          <TableCell>
                            {!e.keepRecommended ? (
                              <input
                                type="checkbox"
                                aria-label={`Select ${e.code ?? e.name}`}
                                checked={selected.has(e.id)}
                                onChange={() => toggleSelect(e.id)}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.code ?? "—"}
                          </TableCell>
                          <TableCell>{e.totalStockQty}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.createdAt.slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            {e.keepRecommended ? (
                              <span className="text-xs font-medium text-inflow">
                                Keep
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Duplicate
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {totalDuplicates > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllRecommended}
                >
                  Select duplicates to remove
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate({ removeAll: true })}
                >
                  {deleteMut.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 size-4" />
                  )}
                  Delete all {totalDuplicates} duplicates
                </Button>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {selected.size > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMut.isPending}
                onClick={() =>
                  deleteMut.mutate({ productIds: Array.from(selected) })
                }
              >
                {deleteMut.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                Delete selected ({selected.size})
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
