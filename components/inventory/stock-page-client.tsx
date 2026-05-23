"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { InventoryImportDialog } from "@/components/inventory/inventory-import-dialog";
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
import { CatalogCategoryFilter } from "@/components/inventory/catalog-category-filter";
import {
  CatalogCategoryTableHeader,
  stockSectionValue,
} from "@/components/inventory/catalog-category-table-header";
import { patchStockQuantity } from "@/lib/api/inventory-catalog-fetch";
import { groupCatalogByCategory } from "@/lib/products/catalog-grouping";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { suggestPurchaseOrderFromStock } from "@/lib/actions/purchase-orders";
import { downloadInventoryTemplate } from "@/lib/excel/inventory-template";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
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
  const [importOpen, setImportOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });

  const defaultOutletId = useMemo(
    () => resolveDefaultOutletId(outlets) ?? "",
    [outlets]
  );

  const invalidateAfterImport = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock-levels", outletId],
    queryFn: () => listStockLevels(outletId),
  });

  const summary = useMemo(() => {
    const totalValue = rows.reduce((s, r) => s + r.stock_value, 0);
    const totalRetailValue = rows.reduce((s, r) => s + r.retail_stock_value, 0);
    const withQty = rows.filter((r) => r.quantity > 0);
    return {
      totalValue,
      totalRetailValue,
      lineCount: rows.length,
      skusWithQty: withQty.length,
      lowStockCount: rows.filter((r) => r.stock_status === "low").length,
      outOfStockCount: rows.filter(
        (r) => r.quantity <= 0 && r.reorder_point > 0
      ).length,
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

  const categoryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category_name))).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category_name !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.product_name.toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q)
      );
    });
  }, [rows, categoryFilter, search]);

  const stockSections = useMemo(() => {
    return groupCatalogByCategory(
      filteredRows.map((r) => ({
        ...r,
        categoryName: r.category_name,
        name: r.product_name,
      }))
    ).map((section) => ({
      categoryName: section.categoryName,
      rows: section.rows,
    }));
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Quantity on hand and inventory value by outlet. Use the same Excel
            template as before to import or update products and stock.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ["stock-levels"] })
            }
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <Link
            href="/inventory/catch-up"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Catch-up
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={downloadInventoryTemplate}
          >
            <Download className="mr-2 size-4" />
            Template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Import Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          title="Stock valuation"
          value={formatTzs(summary?.totalValue ?? 0)}
          subtitle="Qty × buying (same as price list)"
          variant="inflow"
        />
        <KpiCard
          title="Retail stock value"
          value={formatTzs(summary?.totalRetailValue ?? 0)}
          subtitle="Qty × selling from price list"
        />
        <KpiCard
          title="SKUs with qty"
          value={String(summary?.skusWithQty ?? 0)}
          subtitle={`${summary?.lineCount ?? 0} products in catalogue`}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="max-w-md flex-1"
          placeholder="Search product, SKU, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <CatalogCategoryFilter
          categories={categoryOptions}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
      </div>

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
              No active products. Add products under Inventory → Products, or
              import Excel.
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No products match your filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Buying</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">Cost value</TableHead>
                  <TableHead className="text-right">Sell value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockSections.map((section) => (
                  <Fragment key={section.categoryName}>
                    <CatalogCategoryTableHeader
                      categoryName={section.categoryName}
                      itemCount={section.rows.length}
                      colSpan={9}
                      stockValue={stockSectionValue(section.rows)}
                    />
                    {section.rows.map((r) => (
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
                  </Fragment>
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

      <InventoryImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        outlets={outlets}
        defaultOutletId={defaultOutletId}
        onImported={invalidateAfterImport}
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
        {row.cost_price > 0 ? formatTzs(row.cost_price) : "—"}
      </TableCell>
      <TableCell className="text-right font-money">
        {row.retail_price > 0 ? formatTzs(row.retail_price) : "—"}
      </TableCell>
      <TableCell className="text-right font-money text-muted-foreground">
        {formatTzs(row.stock_value)}
      </TableCell>
      <TableCell className="text-right font-money">
        {formatTzs(row.retail_stock_value)}
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
