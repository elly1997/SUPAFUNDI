"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importInventoryInChunks,
  previewInventoryImportApi,
} from "@/lib/api/inventory-import-fetch";
import {
  parseInventoryWorkbook,
  type InventoryImportRow,
} from "@/lib/excel/parse-inventory";
import type {
  InventoryImportMode,
  InventoryImportPreview,
} from "@/lib/inventory/run-import";

type OutletOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outlets: OutletOption[];
  defaultOutletId: string;
  onImported?: () => void;
};

export function InventoryImportDialog({
  open,
  onOpenChange,
  outlets,
  defaultOutletId,
  onImported,
}: Props) {
  const [importRows, setImportRows] = useState<InventoryImportRow[] | null>(
    null
  );
  const [importOutletId, setImportOutletId] = useState("");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importMode, setImportMode] =
    useState<InventoryImportMode>("catalog_and_stock");
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);

  useEffect(() => {
    if (open && defaultOutletId) {
      setImportOutletId(defaultOutletId);
    }
  }, [open, defaultOutletId]);

  useEffect(() => {
    if (!open) {
      setImportRows(null);
      setImportProgress(null);
      setImportMode("catalog_and_stock");
      setPreview(null);
    }
  }, [open]);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importOutletId || !importRows?.length) {
        throw new Error("Choose an outlet and a valid file.");
      }
      setImportProgress("Starting…");
      return importInventoryInChunks(
        importOutletId,
        importRows,
        importMode,
        (done, total) => setImportProgress(`${done} / ${total} rows`)
      );
    },
    onSuccess: (res) => {
      setImportProgress(null);
      if (!res || !Array.isArray(res.errors)) {
        toast.error("Import failed — no response from server. Try again.");
        return;
      }
      const failed = res.errors.length;
      if (failed) {
        toast.warning(
          `Imported ${res.imported} new, updated ${res.updated}. ${failed} row(s) failed.`
        );
      } else {
        toast.success(
          `Done: ${res.imported} new products, ${res.updated} updated.`
        );
      }
      onOpenChange(false);
      setImportRows(null);
      setPreview(null);
      onImported?.();
    },
    onError: (e) => {
      setImportProgress(null);
      toast.error(e instanceof Error ? e.message : "Import failed");
    },
  });

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const parsed = parseInventoryWorkbook(buf);
    if (!parsed.ok) {
      toast.error(parsed.error);
      setImportRows(null);
      return;
    }
    setImportRows(parsed.rows);
    setPreview(null);
    toast.success(
      parsed.skippedPlaceholders
        ? `Parsed ${parsed.rows.length} row(s). Skipped ${parsed.skippedPlaceholders} leftover row(s) with no name.`
        : `Parsed ${parsed.rows.length} row(s). Review and import.`
    );
  }, []);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!importOutletId || !importRows?.length) {
        throw new Error("Choose an outlet and a valid file.");
      }
      return previewInventoryImportApi(importOutletId, importRows, importMode);
    },
    onSuccess: (res) => setPreview(res),
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Excel</DialogTitle>
          <DialogDescription>
            Import runs only inside the selected outlet. Use catalog mode first
            to create items for this outlet, then opening-stock mode to load
            quantities without mixing with the main store.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Target outlet (stock)</Label>
            {outlets.length === 0 ? (
              <p className="text-sm text-destructive">
                No outlets loaded — add one in Settings first.
              </p>
            ) : (
              <select
                aria-label="Target outlet for import"
                className="flex h-9 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm"
                value={importOutletId}
                onChange={(e) => setImportOutletId(e.target.value)}
              >
                <option value="">Select…</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-2">
            <Label>Import mode</Label>
            <select
              aria-label="Import mode"
              className="flex h-9 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm"
              value={importMode}
              onChange={(e) =>
                setImportMode(e.target.value as InventoryImportMode)
              }
            >
              <option value="catalog_and_stock">
                Create/update catalog + load stock
              </option>
              <option value="catalog_only">
                Create/update outlet catalog only
              </option>
              <option value="stock_only">Load opening stock only</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Same names are checked only inside this outlet. A missing item in
              stock-only mode is treated as an error until the outlet catalog is
              created first.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock-xlsx">Spreadsheet (.xlsx)</Label>
            <Input
              id="stock-xlsx"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {importRows && importRows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    previewMutation.isPending ||
                    !importOutletId ||
                    !importRows?.length
                  }
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Preview import
                </Button>
                {preview ? (
                  <p className="text-xs text-muted-foreground">
                    {preview.summary.create} create, {preview.summary.update} update,{" "}
                    {preview.summary.missing} missing, {preview.summary.conflict} conflict
                  </p>
                ) : null}
              </div>
              <div className="max-h-56 overflow-auto rounded-md border text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Preview</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.slice(0, 50).map((r, i) => {
                      const status =
                        preview?.rows.find(
                          (p) => p.code === (r.code ?? "") && p.name === r.name
                        ) ?? null;
                      return (
                        <TableRow key={`${r.code}-${i}`}>
                          <TableCell className="font-mono text-xs">{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.category}</TableCell>
                          <TableCell>{r.quantity}</TableCell>
                          <TableCell>{status?.action ?? "—"}</TableCell>
                          <TableCell className="max-w-[18rem] truncate">
                            {status?.message ?? "Run preview"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {importRows.length > 50 && (
                  <p className="border-t p-2 text-muted-foreground">
                    …and {importRows.length - 50} more rows (all will be previewed/imported).
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              importMutation.isPending ||
              !importOutletId ||
              !importRows?.length ||
              (preview != null &&
                (preview.summary.conflict > 0 || preview.summary.missing > 0))
            }
            onClick={() => importMutation.mutate()}
          >
            {importMutation.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {importMutation.isPending && importProgress
              ? importProgress
              : `Import ${importRows?.length ?? 0} rows`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
