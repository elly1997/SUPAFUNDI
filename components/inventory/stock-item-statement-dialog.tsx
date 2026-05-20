"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchItemStatement } from "@/lib/api/inventory-catalog-fetch";
import { cn } from "@/lib/utils";
import { formatDateTimeEAT, formatTzs } from "@/lib/utils/currency";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  outletId: string | null;
};

export function StockItemStatementDialog({
  open,
  onOpenChange,
  productId,
  productName,
  outletId,
}: Props) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["item-statement", productId, outletId],
    enabled: open && !!productId && !!outletId,
    queryFn: () => fetchItemStatement(productId!, outletId!),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Item statement — {productName}</DialogTitle>
        </DialogHeader>
        {!outletId ? (
          <p className="text-sm text-muted-foreground">
            Select an active outlet in the header.
          </p>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock movements yet for this item at this outlet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Qty ±</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatDateTimeEAT(l.date)}
                  </TableCell>
                  <TableCell className="text-xs">{l.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.reference ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-money text-sm",
                      l.quantityDelta > 0 && "text-inflow",
                      l.quantityDelta < 0 && "text-destructive"
                    )}
                  >
                    {l.quantityDelta > 0 ? "+" : ""}
                    {l.quantityDelta}
                  </TableCell>
                  <TableCell className="text-right font-money text-xs">
                    {l.unitCost != null ? formatTzs(l.unitCost) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
