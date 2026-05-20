"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
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
import type { ProductPriceCatalogRow } from "@/lib/actions/inventory";
import {
  fetchProductPriceCatalog,
  patchCatalogField,
} from "@/lib/api/inventory-catalog-fetch";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  search?: string;
  canManage?: boolean;
  onClearAll?: () => void;
};

export function ProductsPriceListClient({
  search = "",
  canManage = false,
  onClearAll,
}: Props) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ["product-price-catalog", outletId],
    queryFn: () => fetchProductPriceCatalog(outletId),
  });

  const saveMut = useMutation({
    mutationFn: patchCatalogField,
    onSettled: () => setSavingId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
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

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.code ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Price list</CardTitle>
          <CardDescription>
            Catalogue only — name, code, unit, buying and selling prices. Edits
            save automatically. Import and quantities are on the Stock page.
            {rows.length > 0 ? ` ${rows.length} products loaded.` : ""}
            {outletId
              ? " Buying price applies to your active outlet."
              : " Select an outlet in the header to edit buying price."}
          </CardDescription>
        </div>
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
                        : "No products match your search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <PriceListRow
                      key={r.id}
                      row={r}
                      saving={savingId?.startsWith(r.id) ?? false}
                      onSave={saveField}
                    />
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
}: {
  row: ProductPriceCatalogRow;
  saving: boolean;
  onSave: (
    row: ProductPriceCatalogRow,
    field: "code" | "unit" | "costPrice" | "retailPrice",
    value: string | number
  ) => void;
}) {
  const [code, setCode] = useState(row.code ?? "");
  const [unit, setUnit] = useState(row.unit);
  const [cost, setCost] = useState(String(row.costPrice || ""));
  const [retail, setRetail] = useState(String(row.retailPrice || ""));

  useEffect(() => {
    setCode(row.code ?? "");
    setUnit(row.unit);
    setCost(String(row.costPrice || ""));
    setRetail(String(row.retailPrice || ""));
  }, [row]);

  return (
    <TableRow className={saving ? "opacity-70" : undefined}>
      <TableCell className="font-medium">{row.name}</TableCell>
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
      <TableCell>
        <Input
          className="h-8 w-20"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => {
            const v = unit.trim();
            if (v && v !== row.unit) onSave(row, "unit", v);
          }}
        />
      </TableCell>
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
        <Input
          type="number"
          min={0}
          className="ml-auto h-8 w-28 text-right font-money"
          value={retail}
          onChange={(e) => setRetail(e.target.value)}
          onBlur={() => {
            const n = Number(retail);
            if (Number.isFinite(n) && n >= 0 && n !== row.retailPrice) {
              onSave(row, "retailPrice", n);
            }
          }}
        />
      </TableCell>
    </TableRow>
  );
}
