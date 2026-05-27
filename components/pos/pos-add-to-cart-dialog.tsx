"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import type { PosProductRow } from "@/hooks/usePosProducts";
import {
  enrichUnitsWithConversion,
  hasMultipleUnits,
  maxSellQtyInUnit,
  MIN_SELL_QTY,
  parseSellQty,
  pickDefaultSellUnit,
  resolveUnitPrice,
  sellQtysEqual,
  unitConversionHint,
  type ProductUnitOption,
} from "@/lib/products/units";
import { computeLineTotal } from "@/lib/utils/calculations";
import { fetchProductUnitsMap } from "@/lib/api/product-units-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import type { PosPricingMode } from "@/hooks/usePosProducts";

const QUICK_QTY = [0.5, 1, 2, 5, 10] as const;

export type PosAddToCartPayload = {
  unit: ProductUnitOption;
  quantity: number;
  unitPrice: number;
};

type Props = {
  product: PosProductRow | null;
  pricingMode: PosPricingMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: PosAddToCartPayload) => void;
};

export function PosAddToCartDialog({
  product,
  pricingMode,
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [qty, setQty] = useState("1");

  const { data: unitsByProduct = {} } = useQuery({
    queryKey: ["pos-product-units", product?.id, pricingMode],
    queryFn: () => fetchProductUnitsMap(product ? [product.id] : []),
    enabled: open && !!product?.id,
    staleTime: 5 * 60_000,
  });

  const units = useMemo(() => {
    if (!product) return [];
    const loaded = unitsByProduct[product.id];
    const rawUnits = loaded?.length ? loaded : product.units;
    return enrichUnitsWithConversion(
      rawUnits,
      product.retailPrice,
      product.wholesalePrice,
      pricingMode
    );
  }, [pricingMode, product, unitsByProduct]);

  useEffect(() => {
    if (!open || !product?.id) return;
    setQty("1");
  }, [open, product?.id]);

  useEffect(() => {
    if (!open || !product || units.length === 0) return;
    const preferred = pickDefaultSellUnit(
      units,
      product.retailPrice,
      product.wholesalePrice,
      pricingMode
    );
    setSelectedUnitId((current) =>
      current && units.some((u) => u.id === current)
        ? current
        : (preferred.id ?? "")
    );
  }, [open, product, units, pricingMode]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? units[0],
    [units, selectedUnitId]
  );

  if (!product || !selectedUnit) return null;

  const unitPrice = resolveUnitPrice(
    selectedUnit,
    product.retailPrice,
    product.wholesalePrice,
    pricingMode
  );
  const maxQty = maxSellQtyInUnit(product.stockQty, selectedUnit);
  const parsed = parseSellQty(qty);
  const showUnitPicker = hasMultipleUnits(units);
  const lineTotal = computeLineTotal(parsed, unitPrice, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-left leading-snug">{product.name}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {formatTzs(unitPrice)} / {selectedUnit.unitLabel}
            {` · ${maxQty} ${selectedUnit.unitLabel} available`}
            {unitConversionHint(selectedUnit)}
          </p>
          <p className="text-xs text-muted-foreground">
            Fractions allowed (e.g. 0.5 m, 1.25 kg).
          </p>
        </DialogHeader>

        {showUnitPicker && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unit of measure
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {units.map((u) => {
                const price = resolveUnitPrice(
                  u,
                  product.retailPrice,
                  product.wholesalePrice,
                  pricingMode
                );
                const sel = u.id === selectedUnit.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnitId(u.id)}
                    className={cn(
                      "rounded-xl border-2 px-3 py-3 text-left transition-colors touch-manipulation",
                      sel
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <span className="block font-semibold">{u.unitLabel}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTzs(price)}
                      {unitConversionHint(u)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 gap-2">
          {QUICK_QTY.map((n) => (
            <Button
              key={n}
              type="button"
              variant={sellQtysEqual(parsed, n) ? "default" : "outline"}
              className="h-11 rounded-xl font-bold"
              disabled={n > maxQty}
              onClick={() => setQty(String(n))}
            >
              {n}
            </Button>
          ))}
        </div>

        <Input
          type="number"
          min={MIN_SELL_QTY}
          max={maxQty}
          step="any"
          inputMode="decimal"
          className="h-14 rounded-xl text-center text-2xl font-bold font-money tabular-nums"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />

        <DialogFooter className="gap-2 sm:flex-col">
          <Button
            className="h-12 w-full rounded-xl text-base font-semibold"
            disabled={parsed > maxQty || parsed < MIN_SELL_QTY}
            onClick={() => {
              onConfirm({
                unit: selectedUnit,
                quantity: parsed,
                unitPrice,
              });
              onOpenChange(false);
            }}
          >
            Add {parsed} {selectedUnit.unitLabel} · {formatTzs(lineTotal)}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
