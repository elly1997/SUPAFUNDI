"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
  fetchProductEditDetail,
  saveProductEdit,
} from "@/lib/api/product-units-fetch";
import { invalidatePriceDependentQueries } from "@/lib/query/invalidate-price-queries";
type UnitDraft = {
  key: string;
  id?: string;
  unitLabel: string;
  factorToBase: string;
  isBase: boolean;
  unitsPerBase: boolean;
  retailPrice: string;
  wholesalePrice: string;
};

type Props = {
  productId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function newUnitDraft(isBase = false): UnitDraft {
  return {
    key: crypto.randomUUID(),
    unitLabel: isBase ? "pcs" : "box",
    factorToBase: isBase ? "1" : "1",
    isBase,
    unitsPerBase: false,
    retailPrice: "",
    wholesalePrice: "",
  };
}

export function ProductEditDialog({ productId, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitDrafts, setUnitDrafts] = useState<UnitDraft[]>([]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["product-edit", productId],
    queryFn: () => fetchProductEditDetail(productId!),
    enabled: open && !!productId,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCategoryId(data.categoryId ?? "");
    setUnitDrafts(
      data.units.map((u) => ({
        key: u.id,
        id: u.id.startsWith("default-") ? undefined : u.id,
        unitLabel: u.unitLabel,
        factorToBase: String(u.factorToBase),
        isBase: u.isBase,
        unitsPerBase: u.unitsPerBase ?? false,
        retailPrice: u.retailPrice != null ? String(u.retailPrice) : "",
        wholesalePrice:
          u.wholesalePrice != null ? String(u.wholesalePrice) : "",
      }))
    );
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("No product");
      const units = unitDrafts.map((u, i) => ({
        id: u.id,
        unitLabel: u.unitLabel.trim(),
        factorToBase: Number(u.factorToBase),
        isBase: u.isBase,
        unitsPerBase: u.isBase ? false : u.unitsPerBase,
        retailPrice: u.retailPrice ? Number(u.retailPrice) : null,
        wholesalePrice: u.wholesalePrice ? Number(u.wholesalePrice) : null,
        sortOrder: i,
      }));
      await saveProductEdit(productId, {
        name: name.trim(),
        categoryId: categoryId || null,
        units,
      });
    },
    onSuccess: () => {
      toast.success("Product updated");
      onOpenChange(false);
      invalidatePriceDependentQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
    },
  });

  const setBaseUnit = (key: string) => {
    setUnitDrafts((prev) =>
      prev.map((u) => ({
        ...u,
        isBase: u.key === key,
        factorToBase: u.key === key ? "1" : u.factorToBase,
        unitsPerBase: u.key === key ? false : u.unitsPerBase,
      }))
    );
  };

  const addAltUnit = () => {
    setUnitDrafts((prev) => [...prev, newUnitDraft(false)]);
  };

  const removeUnit = (key: string) => {
    setUnitDrafts((prev) => {
      const next = prev.filter((u) => u.key !== key);
      if (next.length === 0) return [newUnitDraft(true)];
      if (!next.some((u) => u.isBase)) next[0]!.isBase = true;
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>
            Name, category, and units of measure. Stock is tracked in the base
            unit; add alternates (e.g. box = 500 pcs) for POS.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load product"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-category">Category</Label>
              <select
                id="edit-category"
                aria-label="Category"
                className="flex min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">General (none)</option>
                {(data?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Units of measure</Label>
                <Button type="button" variant="outline" size="sm" onClick={addAltUnit}>
                  <Plus className="mr-1 size-3.5" />
                  Add unit
                </Button>
              </div>
              <p className="form-hint">
                Stock is tracked in the base unit. For a larger sell unit (e.g. box),
                factor = base units per box (500 pcs per box). For a smaller sell
                unit (e.g. meters when stock is rolls), factor = how many of that
                unit per 1 base (200 meters per roll). POS detects this from unit
                prices.
              </p>
              <div className="space-y-3">
                {unitDrafts.map((u) => (
                  <div
                    key={u.key}
                    className="rounded-xl border border-border bg-surface-1/30 p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="base-unit"
                          checked={u.isBase}
                          onChange={() => setBaseUnit(u.key)}
                        />
                        Base (stock) unit
                      </label>
                      {unitDrafts.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="ml-auto size-11 text-destructive"
                          onClick={() => removeUnit(u.key)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Label</Label>
                        <Input
                          value={u.unitLabel}
                          onChange={(e) =>
                            setUnitDrafts((prev) =>
                              prev.map((x) =>
                                x.key === u.key
                                  ? { ...x, unitLabel: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder="pcs, box…"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Conversion factor</Label>
                        <Input
                          type="number"
                          min={0.000001}
                          step="any"
                          disabled={u.isBase}
                          value={u.isBase ? "1" : u.factorToBase}
                          onChange={(e) =>
                            setUnitDrafts((prev) =>
                              prev.map((x) =>
                                x.key === u.key
                                  ? { ...x, factorToBase: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                      {!u.isBase && (
                        <div className="sm:col-span-2">
                          <Label className="text-xs">Conversion direction</Label>
                          <select
                            aria-label={`Conversion direction for ${u.unitLabel || "unit"}`}
                            className="mt-1 flex min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={u.unitsPerBase ? "units_per_base" : "base_per_unit"}
                            onChange={(e) =>
                              setUnitDrafts((prev) =>
                                prev.map((x) =>
                                  x.key === u.key
                                    ? {
                                        ...x,
                                        unitsPerBase:
                                          e.target.value === "units_per_base",
                                      }
                                    : x
                                )
                              )
                            }
                          >
                            <option value="base_per_unit">
                              1 {u.unitLabel || "sell unit"} consumes this many base units
                            </option>
                            <option value="units_per_base">
                              1 base unit contains this many {u.unitLabel || "sell units"}
                            </option>
                          </select>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs">Retail (TZS)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={u.retailPrice}
                          onChange={(e) =>
                            setUnitDrafts((prev) =>
                              prev.map((x) =>
                                x.key === u.key
                                  ? { ...x, retailPrice: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Wholesale (TZS)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={u.wholesalePrice}
                          onChange={(e) =>
                            setUnitDrafts((prev) =>
                              prev.map((x) =>
                                x.key === u.key
                                  ? { ...x, wholesalePrice: e.target.value }
                                  : x
                              )
                            )
                          }
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || saveMut.isPending || isLoading}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
