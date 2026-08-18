"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  downloadCatalogJson,
  downloadCatalogXlsx,
} from "@/lib/api/backup-fetch";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { importInventoryInChunks } from "@/lib/api/inventory-import-fetch";
import { parseInventoryWorkbook } from "@/lib/excel/parse-inventory";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { formatTzs } from "@/lib/utils/currency";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";

export function CatalogBackupPanel() {
  const queryClient = useQueryClient();
  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const defaultOutletId = resolveDefaultOutletId(outlets) ?? "";
  const [outletId, setOutletId] = useState("");
  const [restoreRows, setRestoreRows] = useState<InventoryImportRow[] | null>(
    null
  );
  const [restoreProgress, setRestoreProgress] = useState<string | null>(null);

  const effectiveOutletId = outletId || defaultOutletId;
  const outletName =
    outlets.find((o) => o.id === effectiveOutletId)?.name ?? "outlet";

  const exportJsonMut = useMutation({
    mutationFn: () => downloadCatalogJson(effectiveOutletId),
    onSuccess: (backup) => {
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `catalog-${outletName.replace(/[^\w\-]+/g, "_")}-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${backup.productCount} products (JSON)`);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Export failed"),
  });

  const exportXlsxMut = useMutation({
    mutationFn: () => downloadCatalogXlsx(effectiveOutletId, outletName),
    onSuccess: () => toast.success("Excel catalog downloaded"),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Export failed"),
  });

  const restoreMut = useMutation({
    mutationFn: async () => {
      if (!effectiveOutletId || !restoreRows?.length) {
        throw new Error("Choose an outlet and a valid backup file.");
      }
      setRestoreProgress("Starting…");
      return importInventoryInChunks(
        effectiveOutletId,
        restoreRows,
        "catalog_and_stock",
        (done, total) => setRestoreProgress(`${done} / ${total} rows`)
      );
    },
    onSuccess: (res) => {
      setRestoreProgress(null);
      if (!res) {
        toast.error("Restore failed — no response from server.");
        return;
      }
      const failed = res.errors.length;
      if (failed) {
        toast.warning(
          `Restored ${res.imported} new, updated ${res.updated}. ${failed} row(s) failed.`
        );
      } else {
        toast.success(
          `Catalog restored: ${res.imported} new, ${res.updated} updated.`
        );
      }
      setRestoreRows(null);
      void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
    },
    onError: (e) => {
      setRestoreProgress(null);
      toast.error(e instanceof Error ? e.message : "Restore failed");
    },
  });

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text) as {
          products?: Array<InventoryImportRow & { productId?: string }>;
        };
        if (!parsed.products?.length) {
          throw new Error("JSON backup has no products array.");
        }
        setRestoreRows(
          parsed.products.map((p) => ({
            code: p.code ?? "",
            name: p.name,
            category: p.category,
            quantity: p.quantity,
            cost: p.cost,
            retailPrice: p.retailPrice,
            unit: p.unit,
            notes: p.notes,
          }))
        );
        toast.success(`Loaded ${parsed.products.length} products from JSON`);
        return;
      }
      const buffer = await file.arrayBuffer();
      const parsed = parseInventoryWorkbook(buffer);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (!parsed.rows.length) {
        throw new Error("No product rows found in spreadsheet.");
      }
      setRestoreRows(parsed.rows);
      toast.success(`Loaded ${parsed.rows.length} rows from Excel`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read file");
      setRestoreRows(null);
    }
  }, []);

  const preview = restoreRows?.slice(0, 8) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalog backup &amp; restore</CardTitle>
        <CardDescription>
          Download your product catalog (prices and stock per outlet) as Excel or
          JSON. Upload the same format to restore or merge products.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="backup-outlet">Outlet (stock quantities)</Label>
          <select
            id="backup-outlet"
            className="flex h-10 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm"
            value={effectiveOutletId}
            onChange={(e) => setOutletId(e.target.value)}
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!effectiveOutletId || exportXlsxMut.isPending}
            onClick={() => exportXlsxMut.mutate()}
          >
            {exportXlsxMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Download Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!effectiveOutletId || exportJsonMut.isPending}
            onClick={() => exportJsonMut.mutate()}
          >
            {exportJsonMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Download JSON
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">Restore catalog</p>
          <p className="text-xs text-muted-foreground">
            Uses the same import rules as Stock → Import Excel. Existing products
            match by code or name; new rows are added.
          </p>
          <div>
            <Label htmlFor="restore-file" className="sr-only">
              Backup file
            </Label>
            <Input
              id="restore-file"
              type="file"
              accept=".xlsx,.xls,.json"
              className="max-w-md"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {restoreRows && (
            <>
              <p className="text-sm text-muted-foreground">
                {restoreRows.length} product(s) ready
                {restoreProgress ? ` · ${restoreProgress}` : ""}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead className="text-right">Retail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={`${r.code}-${i}`}>
                        <TableCell className="font-mono text-xs">
                          {r.code || "—"}
                        </TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.quantity}</TableCell>
                        <TableCell className="text-right font-money text-sm">
                          {r.retailPrice != null
                            ? formatTzs(r.retailPrice)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {restoreRows.length > preview.length && (
                <p className="text-xs text-muted-foreground">
                  …and {restoreRows.length - preview.length} more
                </p>
              )}
              <Button
                type="button"
                disabled={restoreMut.isPending}
                onClick={() => restoreMut.mutate()}
              >
                {restoreMut.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                Restore catalog
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
