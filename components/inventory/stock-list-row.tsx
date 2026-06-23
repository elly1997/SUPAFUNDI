"use client";

import {
  ArrowLeftRight,
  FileText,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { PriceInsightIconButton } from "@/components/inventory/price-insight-dialog";
import type { PriceRecommendation } from "@/lib/analytics/pricing-insights";
import { needsPriceAdjustment } from "@/lib/analytics/pricing-insights";
import type { StockLevelRow } from "@/lib/actions/stock";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

const statusLabel = {
  out_of_stock: "Out",
  low: "Low",
  ok: "OK",
} as const;

const statusClass = {
  out_of_stock: "bg-destructive/15 text-destructive",
  low: "bg-warning/15 text-warning",
  ok: "bg-inflow/15 text-inflow",
} as const;

export type PendingInventoryChange = {
  productId: string;
  productName: string;
  kind: "quantity" | "costPrice" | "retailPrice";
  previousValue: string;
  newValue: string;
  numericValue: number;
};

type RowProps = {
  row: StockLevelRow;
  outletId: string | null;
  saving: boolean;
  recommendation?: PriceRecommendation;
  onRequestChange: (change: PendingInventoryChange) => void;
  onStatement: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
};

export function StockListRow({
  row,
  outletId,
  saving,
  recommendation,
  onRequestChange,
  onStatement,
  onTransfer,
  onDelete,
}: RowProps) {
  const [qty, setQty] = useState(String(row.quantity));
  const [cost, setCost] = useState(String(row.cost_price || ""));
  const [retail, setRetail] = useState(String(row.retail_price || ""));

  useEffect(() => {
    setQty(String(row.quantity));
    setCost(String(row.cost_price || ""));
    setRetail(String(row.retail_price || ""));
  }, [row.quantity, row.cost_price, row.retail_price]);

  const suggestApply = (price: number) => {
    onRequestChange({
      productId: row.product_id,
      productName: row.product_name,
      kind: "retailPrice",
      previousValue: row.retail_price > 0 ? formatTzs(row.retail_price) : "—",
      newValue: formatTzs(price),
      numericValue: price,
    });
    setRetail(String(price));
  };

  return (
    <TableRow className={saving ? "opacity-70" : undefined}>
      <TableCell>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-medium",
            statusClass[row.stock_status]
          )}
        >
          {statusLabel[row.stock_status]}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs">{row.code ?? "—"}</TableCell>
      <TableCell className="min-w-[10rem]">
        <p className="font-medium leading-snug">{row.product_name}</p>
        <p className="text-xs text-muted-foreground">{row.category_name}</p>
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          step="any"
          className="ml-auto min-h-10 w-24 text-right font-money"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = Number(qty);
            if (Number.isFinite(n) && n >= 0 && n !== row.quantity) {
              onRequestChange({
                productId: row.product_id,
                productName: row.product_name,
                kind: "quantity",
                previousValue: `${row.quantity} ${row.unit}`,
                newValue: `${n} ${row.unit}`,
                numericValue: n,
              });
            }
          }}
          disabled={!outletId}
        />
        <span className="text-xs text-muted-foreground">{row.unit}</span>
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          className="ml-auto min-h-10 w-28 text-right font-money"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onBlur={() => {
            const n = Number(cost);
            if (Number.isFinite(n) && n >= 0 && n !== row.cost_price) {
              onRequestChange({
                productId: row.product_id,
                productName: row.product_name,
                kind: "costPrice",
                previousValue: row.cost_price > 0 ? formatTzs(row.cost_price) : "—",
                newValue: formatTzs(n),
                numericValue: n,
              });
            }
          }}
          disabled={!outletId}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-0.5">
          <Input
            type="number"
            min={0}
            className="min-h-10 w-28 text-right font-money"
            placeholder="—"
            value={retail}
            onChange={(e) => setRetail(e.target.value)}
            onBlur={() => {
              const n = Number(retail);
              if (
                Number.isFinite(n) &&
                n >= 0 &&
                n !== row.retail_price
              ) {
                onRequestChange({
                  productId: row.product_id,
                  productName: row.product_name,
                  kind: "retailPrice",
                  previousValue:
                    row.retail_price > 0 ? formatTzs(row.retail_price) : "—",
                  newValue: formatTzs(n),
                  numericValue: n,
                });
              }
            }}
            disabled={!outletId}
          />
          <PriceInsightIconButton
            recommendation={recommendation}
            productName={row.product_name}
            onApplyPrice={suggestApply}
            applying={saving}
          />
        </div>
        {recommendation && needsPriceAdjustment(recommendation) ? (
          <p className="mt-0.5 text-right text-[10px] text-primary">
            Suggest {formatTzs(recommendation.recommendedRetail)}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-right font-money text-muted-foreground">
        {formatTzs(row.stock_value)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-1">
          {row.quantity > 0 && onTransfer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTransfer}
              title="Transfer"
            >
              <ArrowLeftRight className="size-3.5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStatement}
            title="Statement"
          >
            <FileText className="size-3.5" />
          </Button>
          {row.quantity === 0 && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
