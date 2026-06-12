"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useDeferredValue, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { InventoryImportDialog } from "@/components/inventory/inventory-import-dialog";
import { IncomingTransfersPanel } from "@/components/inventory/incoming-transfers-panel";
import { StockItemStatementDialog } from "@/components/inventory/stock-item-statement-dialog";
import { StockTransferDialog } from "@/components/inventory/stock-transfer-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
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
import { CatalogCategoryFilter } from "@/components/inventory/catalog-category-filter";
import {
  CatalogCategoryTableHeader,
  stockSectionValue,
} from "@/components/inventory/catalog-category-table-header";
import { patchStockQuantity, deleteProductApi } from "@/lib/api/inventory-catalog-fetch";
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import { groupCatalogByCategory } from "@/lib/products/catalog-grouping";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { suggestPurchaseOrderFromStock } from "@/lib/actions/purchase-orders";
import { downloadInventoryTemplate } from "@/lib/excel/inventory-template";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import type { StockLevelRow, StockStatus } from "@/lib/actions/stock";
import { fetchStockLevelsPage } from "@/lib/api/stock-fetch";
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

const PAGE_SIZE = 50;

export function StockPageClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const role = useAuthStore((s) => s.session?.role ?? null);
  const canManage = canManageSettings(isUserRole(role ?? "") ? role : null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statementRow, setStatementRow] = useState<StockLevelRow | null>(null);
  const [transferRow, setTransferRow] = useState<StockLevelRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockLevelRow | null>(null);
  const [savingQtyId, setSavingQtyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StockStatus | "all">("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    setPage(1);
  }, [deferredSearch, categoryFilter, statusFilter, outletId]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "stock-levels",
      "page",
      outletId,
      page,
      PAGE_SIZE,
      deferredSearch,
      categoryFilter,
      statusFilter,
    ],
    queryFn: () =>
      fetchStockLevelsPage({
        outletId,
        page,
        pageSize: PAGE_SIZE,
        search: deferredSearch,
        categoryId: categoryFilter,
        status: statusFilter,
      }),
    enabled: !!outletId,
    staleTime: 90_000,
    placeholderData: (prev) => prev,
  });
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const summary = data?.summary;
  const total = data?.total ?? 0;

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

  const deleteMut = useMutation({
    mutationFn: (productId: string) => deleteProductApi(productId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Product removed from catalogue");
        setDeleteTarget(null);
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
        void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
      } else toast.error(r.message);
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

  const attentionCount =
    (summary?.lowStockCount ?? 0) + (summary?.outOfStockCount ?? 0);

  const categoryOptions = data?.categories ?? [];

  const stockSections = useMemo(() => {
    return groupCatalogByCategory(
      rows.map((r) => ({
        ...r,
        categoryName: r.category_name,
        name: r.product_name,
      }))
    ).map((section) => ({
      categoryName: section.categoryName,
      rows: section.rows,
    }));
  }, [rows]);

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
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
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

      <IncomingTransfersPanel outletId={outletId} compact />

      {attentionCount > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {attentionCount} product(s) need attention
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
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter((v as StockStatus | "all") ?? "all")}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out_of_stock">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            Stock on hand
            {isFetching && !isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/inventory/transfers"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <ArrowLeftRight className="mr-1 size-3.5" />
              Transfers
            </Link>
            <Link
              href="/inventory/receive"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Receive goods
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && !data ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 && total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {deferredSearch || categoryFilter !== "all" || statusFilter !== "all"
                ? "No products match your filters."
                : "No active products. Add products under Inventory → Products, or import Excel."}
            </p>
          ) : (
            <>
            <div className="space-y-3 md:hidden">
              {stockSections.map((section) => (
                <div key={section.categoryName} className="space-y-2">
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {section.categoryName} · {section.rows.length}
                  </div>
                  {section.rows.map((r) => (
                    <StockCard
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
                      onTransfer={() => setTransferRow(r)}
                      onDelete={canManage ? () => setDeleteTarget(r) : undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="hidden md:block">
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
                        onTransfer={() => setTransferRow(r)}
                        onDelete={canManage ? () => setDeleteTarget(r) : undefined}
                      />
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
          {total > PAGE_SIZE ? (
            <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!data?.hasMore || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
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

      <StockTransferDialog
        open={!!transferRow}
        onOpenChange={(o) => !o && setTransferRow(null)}
        row={transferRow}
        fromOutletId={outletId}
        outlets={outlets}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
          void queryClient.invalidateQueries({ queryKey: ["incoming-transfers"] });
          void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
        }}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove product from shop?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong className="text-foreground">{deleteTarget?.product_name}</strong>?
            This is only allowed when stock is zero across all outlets.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() =>
                deleteTarget && deleteMut.mutate(deleteTarget.product_id)
              }
            >
              {deleteMut.isPending ? "Removing…" : "Delete product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StockRow({
  row,
  outletId,
  saving,
  onQtySave,
  onStatement,
  onTransfer,
  onDelete,
}: {
  row: StockLevelRow;
  outletId: string | null;
  saving: boolean;
  onQtySave: (qty: number) => void;
  onStatement: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
}) {
  const [qty, setQty] = useState(String(row.quantity));
  useEffect(() => {
    setQty(String(row.quantity));
  }, [row.quantity]);

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
          className="ml-auto min-h-11 w-28 text-right font-money"
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
        <div className="flex flex-wrap justify-end gap-1">
          {row.quantity > 0 && onTransfer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onTransfer}
              title="Transfer to another outlet"
            >
              <ArrowLeftRight className="mr-1 size-3.5" />
              Transfer
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onStatement}
            title="View purchases, sales and adjustments"
          >
            <FileText className="mr-1 size-3.5" />
            Statement
          </Button>
          {row.quantity === 0 && onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onDelete}
              title="Delete product (zero stock only)"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function StockCard({
  row,
  outletId,
  saving,
  onQtySave,
  onStatement,
  onTransfer,
  onDelete,
}: {
  row: StockLevelRow;
  outletId: string | null;
  saving: boolean;
  onQtySave: (qty: number) => void;
  onStatement: () => void;
  onTransfer?: () => void;
  onDelete?: () => void;
}) {
  const [qty, setQty] = useState(String(row.quantity));
  useEffect(() => {
    setQty(String(row.quantity));
  }, [row.quantity]);

  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", saving && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug text-foreground">{row.product_name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.code ?? "No SKU"} · {row.unit}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded px-2 py-1 text-xs font-medium",
            statusClass[row.stock_status]
          )}
        >
          {statusLabel[row.stock_status]}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Buying</span>
          <p className="font-money">{row.cost_price > 0 ? formatTzs(row.cost_price) : "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Selling</span>
          <p className="font-money">{row.retail_price > 0 ? formatTzs(row.retail_price) : "—"}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Cost value</span>
          <p className="font-money">{formatTzs(row.stock_value)}</p>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Sell value</span>
          <p className="font-money">{formatTzs(row.retail_stock_value)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[120px] flex-1">
          <label className="text-xs text-muted-foreground">Quantity</label>
          <Input
            type="number"
            min={0}
            step="any"
            className="mt-1 text-right font-money"
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
        </div>
        {row.quantity > 0 && onTransfer ? (
          <Button type="button" variant="secondary" size="sm" onClick={onTransfer}>
            <ArrowLeftRight className="mr-1 size-3.5" />
            Transfer
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStatement}
          title="View purchases, sales and adjustments"
        >
          <FileText className="mr-1 size-3.5" />
          Statement
        </Button>
        {row.quantity === 0 && onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
