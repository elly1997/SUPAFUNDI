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

function Metric({
  label,
  value,
  mono = true,
  warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "truncate text-sm text-foreground",
          mono && "font-mono tabular-nums",
          warn && "font-semibold text-warning"
        )}
      >
        {value}
      </p>
    </div>
  );
}

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
    queryKey: ["purchase-suggestions", outletId, mode, categoryId],
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
    () => selectedLines.reduce((s, l) => s + l.suggestedQty * l.unitCost, 0),
    [selectedLines]
  );

  const allSelected =
    lines.length > 0 && lines.every((l) => l.selected);
  const someSelected = lines.some((l) => l.selected) && !allSelected;

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

  function toggleAll(selected: boolean) {
    setLines((prev) => prev.map((l) => ({ ...l, selected })));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[min(92dvh,900px)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0",
          "max-w-[calc(100%-1rem)] sm:max-w-[min(1120px,calc(100%-2rem))]"
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base sm:text-lg">
            <ClipboardList className="size-5 shrink-0 text-primary" />
            Suggest purchase order
          </DialogTitle>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {outletName ? `${outletName} · ` : ""}
            Restock to ~30 days cover at current sell rate (last 30 days).
          </p>
        </DialogHeader>

        <div className="grid shrink-0 gap-3 border-b border-border px-4 py-3 sm:grid-cols-3 sm:px-6">
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                if (v) setMode(v as PurchaseSuggestionMode);
              }}
            >
              <SelectTrigger className="mt-1 h-10">
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
            <div className="min-w-0">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => setCategoryId(v ?? "all")}
              >
                <SelectTrigger className="mt-1 h-10">
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
          ) : (
            <div className="hidden sm:block" />
          )}
          <div className="min-w-0">
            <Label className="text-xs text-muted-foreground">
              Supplier (optional)
            </Label>
            <Select
              value={supplierId || "none"}
              onValueChange={(v) => setSupplierId(v && v !== "none" ? v : "")}
            >
              <SelectTrigger className="mt-1 h-10">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6">
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
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                  Select all ({lines.length})
                </label>
                <p className="text-xs text-muted-foreground">
                  Target cover:{" "}
                  <span className="font-mono text-foreground">30 days</span>
                </p>
              </div>

              {/* Sticky column header — desktop */}
              <div className="sticky top-0 z-10 hidden rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur md:grid md:grid-cols-[2rem_minmax(12rem,1.6fr)_repeat(6,minmax(4.5rem,0.7fr))_6.5rem] md:gap-2">
                <span />
                <span>Product</span>
                <span className="text-right">On hand</span>
                <span className="text-right">Sold 30d</span>
                <span className="text-right">Avg / day</span>
                <span className="text-right">Cover</span>
                <span className="text-right">Reorder</span>
                <span className="text-right">Order qty</span>
                <span className="text-right">Est. cost</span>
              </div>

              <ul className="space-y-2">
                {lines.map((line) => {
                  const coverWarn =
                    line.daysOfCover != null && line.daysOfCover < 30;
                  return (
                    <li
                      key={line.productId}
                      className={cn(
                        "rounded-lg border border-border bg-card px-3 py-3 transition-opacity",
                        !line.selected && "opacity-55"
                      )}
                    >
                      {/* Mobile / tablet card */}
                      <div className="space-y-3 md:hidden">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 rounded border-border"
                            checked={line.selected}
                            onChange={(e) =>
                              toggleLine(line.productId, e.target.checked)
                            }
                            aria-label={`Include ${line.productName}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug text-foreground">
                              {line.productName}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {line.categoryName}
                              {line.code ? ` · ${line.code}` : ""}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {reasonLabels(line.reasons).map((label) => (
                                <span
                                  key={label}
                                  className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-md bg-surface-1/60 p-2.5 xs:grid-cols-3 sm:grid-cols-3">
                          <Metric
                            label="On hand"
                            value={`${line.quantity} ${line.unit}`}
                          />
                          <Metric
                            label="Sold 30d"
                            value={String(Math.round(line.soldInWindow))}
                          />
                          <Metric
                            label="Avg / day"
                            value={
                              line.avgDailySales > 0
                                ? line.avgDailySales.toFixed(1)
                                : "—"
                            }
                          />
                          <Metric
                            label="Cover"
                            value={
                              line.daysOfCover != null
                                ? `${line.daysOfCover}d`
                                : "—"
                            }
                            warn={coverWarn}
                          />
                          <Metric
                            label="Reorder"
                            value={
                              line.reorderPoint > 0
                                ? String(line.reorderPoint)
                                : "—"
                            }
                          />
                          <Metric
                            label="Unit cost"
                            value={formatTzs(line.unitCost)}
                          />
                        </div>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                          <div>
                            <Label className="text-[10px] uppercase text-muted-foreground">
                              Order qty
                            </Label>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              className="mt-1 h-10 w-28 font-mono text-base"
                              value={line.suggestedQty}
                              disabled={!line.selected}
                              onChange={(e) =>
                                updateLineQty(
                                  line.productId,
                                  Math.max(0, Number(e.target.value) || 0)
                                )
                              }
                            />
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] uppercase text-muted-foreground">
                              Line cost
                            </p>
                            <p className="font-mono text-base font-semibold tabular-nums">
                              {formatTzs(line.suggestedQty * line.unitCost)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Desktop row */}
                      <div className="hidden items-center gap-2 md:grid md:grid-cols-[2rem_minmax(12rem,1.6fr)_repeat(6,minmax(4.5rem,0.7fr))_6.5rem]">
                        <input
                          type="checkbox"
                          className="size-4 justify-self-center rounded border-border"
                          checked={line.selected}
                          onChange={(e) =>
                            toggleLine(line.productId, e.target.checked)
                          }
                          aria-label={`Include ${line.productName}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium leading-snug">
                            {line.productName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {line.categoryName}
                            {line.code ? ` · ${line.code}` : ""}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {reasonLabels(line.reasons).map((label) => (
                              <span
                                key={label}
                                className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-right font-mono text-sm tabular-nums">
                          {line.quantity}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {line.unit}
                          </span>
                        </p>
                        <p className="text-right font-mono text-sm tabular-nums">
                          {Math.round(line.soldInWindow)}
                        </p>
                        <p className="text-right font-mono text-sm tabular-nums">
                          {line.avgDailySales > 0
                            ? line.avgDailySales.toFixed(1)
                            : "—"}
                        </p>
                        <p
                          className={cn(
                            "text-right font-mono text-sm tabular-nums",
                            coverWarn && "font-semibold text-warning"
                          )}
                        >
                          {line.daysOfCover != null
                            ? `${line.daysOfCover}d`
                            : "—"}
                        </p>
                        <p className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                          {line.reorderPoint > 0 ? line.reorderPoint : "—"}
                        </p>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-9 w-full justify-self-end text-right font-mono"
                          value={line.suggestedQty}
                          disabled={!line.selected}
                          onChange={(e) =>
                            updateLineQty(
                              line.productId,
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                        />
                        <p className="text-right font-mono text-sm font-medium tabular-nums">
                          {formatTzs(line.suggestedQty * line.unitCost)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0 flex-col gap-3 rounded-none border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            {selectedLines.length} selected ·{" "}
            <span className="font-mono text-base font-semibold text-foreground">
              {formatTzs(totalCost)}
            </span>
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="btn-primary-gradient flex-1 sm:flex-none"
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
