"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { StockItemStatementDialog } from "@/components/inventory/stock-item-statement-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { patchStockQuantity } from "@/lib/api/inventory-catalog-fetch";
import { suggestPurchaseOrderFromStock } from "@/lib/actions/purchase-orders";
import {
  listStockLevels,
  type StockLevelRow,
  type StockStatus,
} from "@/lib/actions/stock";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

const statusLabel: Record<StockStatus, string> = {
  out_of_stock: "Out of stock",
  low: "Low",
  ok: "OK",
};

const statusClass: Record<StockStatus, string> = {
  out_of_stock: "bg-destructive/15 text-destructive",
  low: "bg-warning/15 text-warning",
  ok: "bg-inflow/15 text-inflow",
};

export function StockPageClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statementRow, setStatementRow] = useState<StockLevelRow | null>(null);
  const [savingQtyId, setSavingQtyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock-levels", outletId],
    queryFn: () => listStockLevels(outletId),
  });

  const summary = useMemo(() => {
    const totalValue = rows.reduce((s, r) => s + r.stock_value, 0);
    return {
      totalValue,
      lineCount: rows.length,
      lowStockCount: rows.filter((r) => r.stock_status === "low").length,
      outOfStockCount: rows.filter((r) => r.stock_status === "out_of_stock")
        .length,
    };
  }, [rows]);

  const qtyMut = useMutation({
    mutationFn: patchStockQuantity,
    onSettled: () => setSavingQtyId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-valuation"] });
      toast.success("Quantity updated");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Update failed");
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    },
  });

  const suggestMut = useMutation({
    mutationFn: () => {
      if (!outletId) throw new Error("Select an outlet");
      return suggestPurchaseOrderFromStock(outletId);
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Draft purchase order created");
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
        router.push(`/inventory/purchase-orders/${r.poId}`);
      } else toast.error(r.message);
    },
  });

  const lowStock = rows.filter((r) => r.stock_status !== "ok");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Stock valuation"
          value={formatTzs(summary?.totalValue ?? 0)}
          subtitle="Qty × cost at active outlet"
          variant="inflow"
        />
        <KpiCard
          title="SKUs on hand"
          value={String(summary?.lineCount ?? 0)}
        />
        <KpiCard
          title="Low stock"
          value={String(summary?.lowStockCount ?? 0)}
          variant="warning"
        />
        <KpiCard
          title="Out of stock"
          value={String(summary?.outOfStockCount ?? 0)}
          variant="outflow"
        />
      </div>

      {lowStock.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {lowStock.length} product(s) need attention
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={!outletId || suggestMut.isPending}
              onClick={() => suggestMut.mutate()}
            >
              {suggestMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardList className="mr-2 h-4 w-4" />
              )}
              Suggest purchase order
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Stock on hand</CardTitle>
          <Link
            href="/inventory/receive"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Receive goods
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No stock records. Import products or receive goods.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead className="text-right">Line value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <StockRow
                    key={`${r.outlet_id}-${r.product_id}`}
                    row={r}
                    outletId={outletId}
                    saving={savingQtyId === r.product_id}
                    onQtySave={(qty) => {
                      if (!outletId) {
                        toast.error("Select an active outlet");
                        return;
                      }
                      setSavingQtyId(r.product_id);
                      qtyMut.mutate({
                        productId: r.product_id,
                        outletId,
                        quantity: qty,
                      });
                    }}
                    onStatement={() => setStatementRow(r)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StockItemStatementDialog
        open={!!statementRow}
        onOpenChange={(o) => !o && setStatementRow(null)}
        productId={statementRow?.product_id ?? null}
        productName={statementRow?.product_name ?? ""}
        outletId={outletId}
      />
    </div>
  );
}

function StockRow({
  row,
  outletId,
  saving,
  onQtySave,
  onStatement,
}: {
  row: StockLevelRow;
  outletId: string | null;
  saving: boolean;
  onQtySave: (qty: number) => void;
  onStatement: () => void;
}) {
  const [qty, setQty] = useState(String(row.quantity));

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
      <TableCell>{row.product_name}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          step="any"
          className="ml-auto h-8 w-24 text-right font-money"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = Number(qty);
            if (Number.isFinite(n) && n >= 0 && n !== row.quantity) {
              onQtySave(n);
            }
          }}
          disabled={!outletId}
        />
        <span className="ml-1 text-xs text-muted-foreground">{row.unit}</span>
      </TableCell>
      <TableCell className="text-right font-money text-muted-foreground">
        {formatTzs(row.cost_price)}
      </TableCell>
      <TableCell className="text-right font-money">
        {formatTzs(row.stock_value)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onStatement}
            title="View purchases, sales and adjustments"
          >
            <FileText className="mr-1 size-3.5" />
            Statement
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
