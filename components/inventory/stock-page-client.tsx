"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listStockLevels } from "@/lib/actions/stock";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

export function StockPageClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock-levels", outletId],
    queryFn: () => listStockLevels(outletId),
  });

  const lowStock = rows.filter((r) => r.needs_reorder);

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {lowStock.length} product(s) at or below reorder point
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Stock on hand</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No stock records. Add products or receive goods.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={`${r.outlet_id}-${r.product_id}`}
                    className={r.needs_reorder ? "bg-amber-50/40" : undefined}
                  >
                    <TableCell>{r.outlet_name}</TableCell>
                    <TableCell>{r.code ?? "—"}</TableCell>
                    <TableCell>{r.product_name}</TableCell>
                    <TableCell className="text-right">
                      {r.quantity} {r.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatTzs(r.cost_price)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatTzs(r.stock_value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
