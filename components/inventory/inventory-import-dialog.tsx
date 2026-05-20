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
import { importInventoryInChunks } from "@/lib/api/inventory-import-fetch";
import { formatTzs } from "@/lib/utils/currency";
import {
  parseInventoryWorkbook,
  type InventoryImportRow,
} from "@/lib/excel/parse-inventory";

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

  useEffect(() => {
    if (open && defaultOutletId && !importOutletId) {
      setImportOutletId(defaultOutletId);
    }
  }, [open, defaultOutletId, importOutletId]);

  useEffect(() => {
    if (!open) {
      setImportRows(null);
      setImportProgress(null);
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
    toast.success(`Parsed ${parsed.rows.length} row(s). Review and import.`);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Excel</DialogTitle>
          <DialogDescription>
            Same layout as your General Stock list: Page, Code, Name,
            Category, Quantity, Cost, Retail Price, Unit, Notes. Duplicate
            product names are rejected. Blank code = auto-generated. Use the
            same code as an existing item to update its stock only.
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
            <Label htmlFor="stock-xlsx">Spreadsheet (.xlsx)</Label>
            <Input
              id="stock-xlsx"
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {importRows && importRows.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Retail</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importRows.slice(0, 50).map((r, i) => (
                    <TableRow key={`${r.code}-${i}`}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.category}</TableCell>
                      <TableCell>{r.quantity}</TableCell>
                      <TableCell>
                        {r.cost != null ? formatTzs(r.cost) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.retailPrice != null ? formatTzs(r.retailPrice) : "—"}
                      </TableCell>
                      <TableCell>{r.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {importRows.length > 50 && (
                <p className="border-t p-2 text-muted-foreground">
                  …and {importRows.length - 50} more rows (all will be imported).
                </p>
              )}
            </div>
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
              !importRows?.length
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
