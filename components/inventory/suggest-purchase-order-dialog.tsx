"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchSupplierOptions } from "@/lib/api/suppliers-fetch";
import {
  buildPurchaseSuggestions,
  createPurchaseOrderFromSuggestions,
} from "@/lib/actions/purchase-orders";
import type { PurchaseSuggestionLine } from "@/lib/inventory/purchase-suggestions";
import type { PurchaseSuggestionMode } from "@/lib/inventory/purchase-suggestions";
import { reasonLabels } from "@/lib/inventory/purchase-suggestions";
import { formatTzs } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";

type CategoryOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outletId: string | null;
  outletName?: string;
  categories?: CategoryOption[];
  defaultMode?: PurchaseSuggestionMode;
};

const MODE_OPTIONS: {
  value: PurchaseSuggestionMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "balanced",
    label: "Balanced",
    hint: "Fast sellers without 30-day cover",
  },
  {
    value: "fast_movers",
    label: "Fast movers",
    hint: "High volume, thin stock",
  },
  {
    value: "low_cover",
    label: "Low cover",
    hint: "Under 30 days of stock at current rate",
  },
  {
    value: "depleted",
    label: "Depleted",
    hint: "Low or out of stock (includes slow movers)",
  },
];

export function SuggestPurchaseOrderDialog({
  open,
  onOpenChange,
  outletId,
  outletName,
  categories = [],
  defaultMode = "balanced",
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<PurchaseSuggestionMode>(defaultMode);
  const [categoryId, setCategoryId] = useState<string>("all");
  const [supplierId, setSupplierId] = useState<string>("");
  const [lines, setLines] = useState<PurchaseSuggestionLine[]>([]);

  const { data: suppliers = [] } = useQuery({
    queryKey: ["supplier-options"],
    queryFn: fetchSupplierOptions,
    enabled: open,
  });

  const suggestQuery = useQuery({
    queryKey: [
      "purchase-suggestions",
      outletId,
      mode,
      categoryId,
    ],
    queryFn: () => {
      if (!outletId) throw new Error("Select an outlet");
      return buildPurchaseSuggestions(outletId, {
        mode,
        categoryId: categoryId === "all" ? null : categoryId,
      });
    },
    enabled: open && !!outletId,
  });

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    setCategoryId("all");
    setSupplierId("");
  }, [open, defaultMode]);

  useEffect(() => {
    if (suggestQuery.data?.lines) {
      setLines(suggestQuery.data.lines.map((l) => ({ ...l })));
    } else {
      setLines([]);
    }
  }, [suggestQuery.data]);

  const selectedLines = useMemo(
    () => lines.filter((l) => l.selected && l.suggestedQty > 0),
    [lines]
  );

  const totalCost = useMemo(
    () =>
      selectedLines.reduce(
        (s, l) => s + l.suggestedQty * l.unitCost,
        0
      ),
    [selectedLines]
  );

  const createMut = useMutation({
    mutationFn: () => {
      if (!outletId) throw new Error("Select an outlet");
      if (selectedLines.length === 0) {
        throw new Error("Select at least one line");
      }
      return createPurchaseOrderFromSuggestions({
        outletId,
        supplierId: supplierId || undefined,
        lines: selectedLines.map((l) => ({
          productId: l.productId,
          orderedQty: l.suggestedQty,
          unitCost: l.unitCost,
        })),
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Draft purchase order created");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
        onOpenChange(false);
        router.push(`/inventory/purchase-orders/${r.poId}`);
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Create failed");
    },
  });

  function updateLineQty(productId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? {
              ...l,
              suggestedQty: qty,
              lineCost: Math.round(qty * l.unitCost * 100) / 100,
            }
          : l
      )
    );
  }

  function toggleLine(productId: string, selected: boolean) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, selected } : l))
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Suggest purchase order
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {outletName
              ? `${outletName} · `
              : ""}
            Restock to ~30 days cover at current sell rate (last 30 days).
          </p>
        </DialogHeader>

        <div className="flex flex-wrap gap-3 border-b border-border px-6 py-3">
          <div className="min-w-[10rem] flex-1">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (v) setMode(v as PurchaseSuggestionMode);
              }}
            >
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label} — {o.hint}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categories.length > 0 ? (
            <div className="min-w-[10rem] flex-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "all")}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="min-w-[10rem] flex-1">
            <Label className="text-xs text-muted-foreground">
              Supplier (optional)
            </Label>
            <Select
              value={supplierId || "none"}
              onValueChange={(v) => setSupplierId(v && v !== "none" ? v : "")}
            >
              <SelectTrigger className="mt-1 h-9">
                <SelectValue placeholder="Assign later" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Assign later</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
          {suggestQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Analysing sales and stock cover…
            </div>
          ) : suggestQuery.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              {suggestQuery.error instanceof Error
                ? suggestQuery.error.message
                : "Could not load suggestions"}
            </p>
          ) : lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products match this filter. Try Depleted mode or another
              category.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Sold 30d</TableHead>
                  <TableHead className="text-right">Cover</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead className="text-right">Est. cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow
                    key={line.productId}
                    className={cn(!line.selected && "opacity-50")}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border"
                        checked={line.selected}
                        onChange={(e) =>
                          toggleLine(line.productId, e.target.checked)
                        }
                        aria-label={`Include ${line.productName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{line.productName}</div>
                      <div className="text-xs text-muted-foreground">
                        {line.categoryName}
                        {line.code ? ` · ${line.code}` : ""}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {reasonLabels(line.reasons).map((label) => (
                          <span
                            key={label}
                            className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.quantity} {line.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Math.round(line.soldInWindow)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {line.daysOfCover != null
                        ? `${line.daysOfCover}d`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="ml-auto h-8 w-20 text-right font-mono"
                        value={line.suggestedQty}
                        disabled={!line.selected}
                        onChange={(e) =>
                          updateLineQty(
                            line.productId,
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatTzs(line.suggestedQty * line.unitCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-4">
          <p className="text-sm text-muted-foreground">
            {selectedLines.length} line
            {selectedLines.length === 1 ? "" : "s"} ·{" "}
            <span className="font-mono font-medium text-foreground">
              {formatTzs(totalCost)}
            </span>
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-primary-gradient"
              disabled={
                !outletId ||
                selectedLines.length === 0 ||
                createMut.isPending
              }
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Create draft PO
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
