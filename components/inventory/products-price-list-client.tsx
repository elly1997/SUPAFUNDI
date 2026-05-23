"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CatalogCategoryTableHeader,
  priceListSectionMargin,
} from "@/components/inventory/catalog-category-table-header";
import type { ProductPriceCatalogRow } from "@/lib/actions/inventory";
import {
  applyMissingRetailPricesApi,
  fetchProductPriceCatalog,
  patchCatalogField,
} from "@/lib/api/inventory-catalog-fetch";
import { useOrgSettingsStore } from "@/stores/orgSettingsStore";
import { groupCatalogByCategory } from "@/lib/products/catalog-grouping";
import { invalidatePriceDependentQueries } from "@/lib/query/invalidate-price-queries";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  search?: string;
  categoryFilter?: string;
  canManage?: boolean;
  onClearAll?: () => void;
  onEditProduct?: (productId: string) => void;
};

export function ProductsPriceListClient({
  search = "",
  categoryFilter = "all",
  canManage = false,
  onClearAll,
  onEditProduct,
}: Props) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const marginPct = useOrgSettingsStore((s) => s.defaultRetailMarginPct);
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["product-price-catalog", outletId],
    queryFn: () => fetchProductPriceCatalog(outletId),
  });

  const missingRetailCount = useMemo(
    () =>
      rows.filter((r) => r.retailPrice == null && r.costPrice > 0).length,
    [rows]
  );

  const invalidateAfterPriceChange = useCallback(() => {
    invalidatePriceDependentQueries(queryClient);
  }, [queryClient]);

  const applyRetailMut = useMutation({
    mutationFn: () => applyMissingRetailPricesApi(outletId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          r.updated > 0
            ? `Set retail on ${r.updated} product(s) using ${r.marginPct}% margin`
            : "All products with cost already have a retail price"
        );
        invalidateAfterPriceChange();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Apply failed"),
  });

  const categoryOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.categoryName))).sort(),
    [rows]
  );

  const saveMut = useMutation({
    mutationFn: patchCatalogField,
    onSettled: () => setSavingId(null),
    onSuccess: () => {
      invalidateAfterPriceChange();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
      void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
    },
  });

  const saveField = useCallback(
    (
      row: ProductPriceCatalogRow,
      field: "code" | "unit" | "costPrice" | "retailPrice",
      value: string | number
    ) => {
      setSavingId(`${row.id}-${field}`);
      saveMut.mutate({
        productId: row.id,
        outletId: outletId ?? undefined,
        field,
        value,
      });
    },
    [outletId, saveMut]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.categoryName !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.code ?? "").toLowerCase().includes(q) ||
        r.categoryName.toLowerCase().includes(q)
      );
    });
  }, [rows, search, categoryFilter]);

  const sections = useMemo(() => groupCatalogByCategory(filtered), [filtered]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Price list</CardTitle>
          <CardDescription>
            Grouped by category (from Excel import or Add product). Edits save
            automatically. Stock quantities are on the Stock page.
            {rows.length > 0 ? ` ${rows.length} products · ${categoryOptions.length} categories.` : ""}
            {outletId
              ? " Buying price applies to your active outlet."
              : " Select an outlet in the header to edit buying price."}{" "}
            Auto retail prices show an <span className="text-warning">Auto</span>{" "}
            badge.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {canManage && missingRetailCount > 0 && (
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
        {canManage && onClearAll && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={onClearAll}
          >
            <Trash2 className="mr-2 size-4" />
            Clear all items
          </Button>
        )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading price list…
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load products."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Buying</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      {rows.length === 0
                        ? "No products yet. Import on Stock or add one manually."
                        : "No products match your filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sections.map((section) => (
                    <Fragment key={section.categoryName}>
                      <CatalogCategoryTableHeader
                        categoryName={section.categoryName}
                        itemCount={section.rows.length}
                        colSpan={5}
                        avgMarginPct={priceListSectionMargin(section.rows)}
                      />
                      {section.rows.map((r) => (
                        <PriceListRow
                          key={r.id}
                          row={r}
                          saving={savingId?.startsWith(r.id) ?? false}
                          onSave={saveField}
                          onEdit={onEditProduct}
                        />
                      ))}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PriceListRow({
  row,
  saving,
  onSave,
  onEdit,
}: {
  row: ProductPriceCatalogRow;
  saving: boolean;
  onSave: (
    row: ProductPriceCatalogRow,
    field: "code" | "unit" | "costPrice" | "retailPrice",
    value: string | number
  ) => void;
  onEdit?: (productId: string) => void;
}) {
  const [code, setCode] = useState(row.code ?? "");
  const [cost, setCost] = useState(String(row.costPrice || ""));
  const [retail, setRetail] = useState(
    row.retailPrice != null ? String(row.retailPrice) : ""
  );

  useEffect(() => {
    setCode(row.code ?? "");
    setCost(String(row.costPrice || ""));
    setRetail(row.retailPrice != null ? String(row.retailPrice) : "");
  }, [row]);

  return (
    <TableRow className={saving ? "opacity-70" : undefined}>
      <TableCell className="font-medium">
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(row.id)}
            className="text-left text-primary underline-offset-2 hover:underline"
          >
            {row.name}
          </button>
        ) : (
          row.name
        )}
        <p className="mt-0.5 text-xs font-normal text-muted-foreground">
          {row.categoryName} · {row.unit}
        </p>
      </TableCell>
      <TableCell>
        <Input
          className="h-8 font-mono text-xs"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => {
            const v = code.trim();
            if (v && v !== (row.code ?? "")) onSave(row, "code", v);
          }}
        />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.unit}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min={0}
          className="ml-auto h-8 w-28 text-right font-money"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          onBlur={() => {
            const n = Number(cost);
            if (Number.isFinite(n) && n >= 0 && n !== row.costPrice) {
              onSave(row, "costPrice", n);
            }
          }}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-1">
          <Input
            type="number"
            min={0}
            className="ml-auto h-8 w-28 text-right font-money"
            placeholder={row.retailPrice == null ? "—" : undefined}
            value={retail}
            onChange={(e) => setRetail(e.target.value)}
            onBlur={() => {
              const n = Number(retail);
              if (
                Number.isFinite(n) &&
                n >= 0 &&
                n !== (row.retailPrice ?? -1)
              ) {
                onSave(row, "retailPrice", n);
              }
            }}
          />
          {row.retailAutoGenerated ? (
            <span
              className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning"
              title="Selling price was calculated from buying price × margin in Settings"
            >
              Auto
            </span>
          ) : row.retailPrice == null && row.costPrice > 0 ? (
            <span className="text-[10px] text-muted-foreground">
              No retail set
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
