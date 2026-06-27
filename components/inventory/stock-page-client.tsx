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
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CatalogCategoryFilter } from "@/components/inventory/catalog-category-filter";
import { AddProductDialog } from "@/components/inventory/add-product-dialog";
import { ProductEditDialog } from "@/components/inventory/product-edit-dialog";
import {
  InventoryChangeReasonDialog,
} from "@/components/inventory/inventory-change-reason-dialog";
import {
  StockListRow,
  type CatalogTextField,
  type PendingInventoryChange,
} from "@/components/inventory/stock-list-row";
import {
  CatalogCategoryTableHeader,
  stockSectionValue,
} from "@/components/inventory/catalog-category-table-header";
import {
  applyMissingRetailPricesApi,
  patchCatalogField,
  patchStockQuantity,
  deleteProductApi,
} from "@/lib/api/inventory-catalog-fetch";
import { downloadCatalogXlsx } from "@/lib/api/backup-fetch";
import { fetchPricingInsights } from "@/lib/api/pricing-insights-fetch";
import { invalidatePriceDependentQueries } from "@/lib/query/invalidate-price-queries";
import { useOrgSettingsStore } from "@/stores/orgSettingsStore";
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import { groupCatalogByCategory } from "@/lib/products/catalog-grouping";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { suggestPurchaseOrderFromStock } from "@/lib/actions/purchase-orders";
import { downloadInventoryTemplate } from "@/lib/excel/inventory-template";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import type { StockLevelRow, StockStatus } from "@/lib/actions/stock";
import { fetchStockLevelsPage, fetchStockLevelsSummary } from "@/lib/api/stock-fetch";
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
  const marginPct = useOrgSettingsStore((s) => s.defaultRetailMarginPct);
  const role = useAuthStore((s) => s.session?.role ?? null);
  const canManage = canManageSettings(isUserRole(role ?? "") ? role : null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statementRow, setStatementRow] = useState<StockLevelRow | null>(null);
  const [transferRow, setTransferRow] = useState<StockLevelRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockLevelRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingInventoryChange | null>(null);
  const [savingFieldId, setSavingFieldId] = useState<string | null>(null);
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
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
    isFetching: summaryFetching,
  } = useQuery({
    queryKey: ["stock-levels", "summary", outletId],
    queryFn: () => fetchStockLevelsSummary(outletId),
    enabled: !!outletId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const total = data?.total ?? 0;
  const rowIds = useMemo(() => rows.map((r) => r.product_id), [rows]);

  const { data: pricingInsights } = useQuery({
    queryKey: ["pricing-insights", outletId, rowIds.join(",")],
    queryFn: () =>
      fetchPricingInsights({
        outletId,
        productIds: rowIds,
      }),
    enabled: !!outletId && rowIds.length > 0,
    staleTime: 60_000,
  });

  const recByProduct = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<typeof pricingInsights>["recommendations"][number]
    >();
    for (const r of pricingInsights?.recommendations ?? []) {
      map.set(r.productId, r);
    }
    return map;
  }, [pricingInsights?.recommendations]);

  const activeOutletName =
    outlets.find((o) => o.id === outletId)?.name ?? "outlet";

  const applyRetailMut = useMutation({
    mutationFn: () => applyMissingRetailPricesApi(outletId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          r.updated > 0
            ? `Set retail on ${r.updated} product(s) using ${r.marginPct}% margin`
            : "All products with cost already have a retail price"
        );
        invalidatePriceDependentQueries(queryClient);
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      } else toast.error(r.message);
    },
  });

  const catalogFieldMut = useMutation({
    mutationFn: patchCatalogField,
    onMutate: (vars) => setSavingFieldId(`${vars.productId}-${vars.field}`),
    onSettled: () => setSavingFieldId(null),
    onSuccess: () => {
      invalidatePriceDependentQueries(queryClient);
      toast.success("Updated");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    },
  });

  const saveCatalogField = (
    productId: string,
    field: CatalogTextField,
    value: string
  ) => {
    catalogFieldMut.mutate({
      productId,
      outletId: outletId ?? undefined,
      field,
      value,
    });
  };

  const isRowSaving = (productId: string) =>
    savingFieldId === productId ||
    (savingFieldId?.startsWith(`${productId}-`) ?? false);

  const confirmChangeMut = useMutation({
    mutationFn: async (params: { change: PendingInventoryChange; reason: string }) => {
      const { change, reason } = params;
      if (!outletId) throw new Error("Select an outlet");
      if (change.kind === "quantity") {
        await patchStockQuantity({
          productId: change.productId,
          outletId,
          quantity: change.numericValue,
          reason: reason || undefined,
        });
      } else {
        await patchCatalogField({
          productId: change.productId,
          outletId,
          field: change.kind,
          value: change.numericValue,
          reason: reason || undefined,
        });
      }
    },
    onMutate: ({ change }) => setSavingFieldId(change.productId),
    onSettled: () => setSavingFieldId(null),
    onSuccess: () => {
      setPendingChange(null);
      invalidatePriceDependentQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      toast.success("Updated");
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Stock &amp; price list
          </h1>
          <p className="text-sm text-muted-foreground">
            Quantities, buying and selling prices in one list. Export to Excel,
            edit SKU and base unit inline, or click a product name (or pencil)
            to change name, category, and sell units (e.g. box / pcs).
          </p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add product
          </Button>
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={applyRetailMut.isPending}
              onClick={() => applyRetailMut.mutate()}
            >
              {applyRetailMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4 text-warning" />
              )}
              Fill missing retail ({marginPct}%)
            </Button>
          )}
          {(pricingInsights?.adjustmentCount ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
              <Tag className="size-3.5" />
              {pricingInsights?.adjustmentCount} suggestion
              {(pricingInsights?.adjustmentCount ?? 0) === 1 ? "" : "s"} on page
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={!outletId || exporting}
            onClick={async () => {
              if (!outletId) return;
              setExporting(true);
              try {
                await downloadCatalogXlsx(outletId, activeOutletName);
                toast.success("Price list downloaded");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Export failed");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Export Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={summaryFetching || isFetching}
            onClick={() => {
              void refetchSummary();
              void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
            }}
          >
            {(summaryFetching || isFetching) ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
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
          value={
            summaryLoading && !summary
              ? "…"
              : formatTzs(summary?.totalValue ?? 0)
          }
          subtitle="Active catalogue · qty × buying at outlet"
          variant="inflow"
        />
        <KpiCard
          title="Retail stock value"
          value={
            summaryLoading && !summary
              ? "…"
              : formatTzs(summary?.totalRetailValue ?? 0)
          }
          subtitle="Active catalogue · qty × selling price"
        />
        <KpiCard
          title="SKUs with qty"
          value={
            summaryLoading && !summary ? "…" : String(summary?.skusWithQty ?? 0)
          }
          subtitle={`${summary?.lineCount ?? 0} products in catalogue`}
        />
        <KpiCard
          title="Low stock"
          value={
            summaryLoading && !summary
              ? "…"
              : String(summary?.lowStockCount ?? 0)
          }
          subtitle="On hand but at/below reorder level"
          variant="warning"
        />
        <KpiCard
          title="Out of stock"
          value={
            summaryLoading && !summary
              ? "…"
              : String(summary?.outOfStockCount ?? 0)
          }
          subtitle="Zero quantity on hand"
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
            Stock &amp; prices
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
                : "No active products. Import Excel or add products to get started."}
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
                      saving={isRowSaving(r.product_id)}
                      onEdit={() => setEditProductId(r.product_id)}
                      onQtySave={(qty) => {
                        if (!outletId) {
                          toast.error("Select an active outlet");
                          return;
                        }
                        if (qty === r.quantity) return;
                        setPendingChange({
                          productId: r.product_id,
                          productName: r.product_name,
                          kind: "quantity",
                          previousValue: `${r.quantity} ${r.unit}`,
                          newValue: `${qty} ${r.unit}`,
                          numericValue: qty,
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
                  <TableHead className="text-right">Qty / unit</TableHead>
                  <TableHead className="text-right">Buying</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">Stock value</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockSections.map((section) => (
                  <Fragment key={section.categoryName}>
                    <CatalogCategoryTableHeader
                      categoryName={section.categoryName}
                      itemCount={section.rows.length}
                      colSpan={8}
                      stockValue={stockSectionValue(section.rows)}
                    />
                    {section.rows.map((r) => (
                      <StockListRow
                        key={`${r.outlet_id}-${r.product_id}`}
                        row={r}
                        outletId={outletId}
                        saving={isRowSaving(r.product_id)}
                        recommendation={recByProduct.get(r.product_id)}
                        onRequestChange={setPendingChange}
                        onSaveCatalogField={(field, value) =>
                          saveCatalogField(r.product_id, field, value)
                        }
                        onEdit={() => setEditProductId(r.product_id)}
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

      <AddProductDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        preferredOutletId={outletId}
        onCreated={invalidateAfterImport}
      />

      <ProductEditDialog
        productId={editProductId}
        open={!!editProductId}
        onOpenChange={(o) => !o && setEditProductId(null)}
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

      <InventoryChangeReasonDialog
        open={!!pendingChange}
        productName={pendingChange?.productName ?? ""}
        kind={pendingChange?.kind ?? "quantity"}
        previousValue={pendingChange?.previousValue ?? ""}
        newValue={pendingChange?.newValue ?? ""}
        pending={confirmChangeMut.isPending}
        onCancel={() => setPendingChange(null)}
        onConfirm={(reason) => {
          if (!pendingChange) return;
          confirmChangeMut.mutate({ change: pendingChange, reason });
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

function StockCard({
  row,
  outletId,
  saving,
  onEdit,
  onQtySave,
  onStatement,
  onTransfer,
  onDelete,
}: {
  row: StockLevelRow;
  outletId: string | null;
  saving: boolean;
  onEdit: () => void;
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
          <button
            type="button"
            onClick={onEdit}
            className="text-left font-semibold leading-snug text-primary underline-offset-2 hover:underline"
          >
            {row.product_name}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.code ?? "No SKU"} · {row.unit}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              statusClass[row.stock_status]
            )}
          >
            {statusLabel[row.stock_status]}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2"
            onClick={onEdit}
          >
            <Pencil className="mr-1 size-3.5" />
            Edit
          </Button>
        </div>
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
