"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package } from "lucide-react";
import Link from "next/link";
import { GrnVoidButton } from "@/components/inventory/grn-void-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchSupplierReceipts,
  invalidateSupplierQueries,
} from "@/lib/api/suppliers-fetch";
import { formatTzs } from "@/lib/utils/currency";

const PAYMENT_LABELS: Record<string, string> = {
  on_account: "On account",
  cash: "Cash",
  mpesa: "M-Pesa",
  bank_transfer: "Bank transfer",
};

type Props = { supplierId: string };

export function SupplierPurchaseHistory({ supplierId }: Props) {
  const queryClient = useQueryClient();
  const { data: receipts = [], isLoading } = useQuery({
    queryKey: ["supplier-receipts", supplierId],
    queryFn: () => fetchSupplierReceipts(supplierId),
  });

  const onVoided = () => {
    void queryClient.invalidateQueries({
      queryKey: ["supplier-receipts", supplierId],
    });
    void queryClient.invalidateQueries({ queryKey: ["supplier", supplierId] });
    invalidateSupplierQueries(queryClient);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="size-5 text-primary" />
          Purchase history
        </CardTitle>
        <CardDescription>
          Goods receipts from this supplier. Void removes stock received on this
          receipt and reverses the supplier bill if received on account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No goods receipts recorded for this supplier yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>PO</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.reference}</TableCell>
                  <TableCell>{r.received_date}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.outlet_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                  </TableCell>
                  <TableCell>
                    {r.po_id ? (
                      <Link
                        href={`/inventory/purchase-orders/${r.po_id}`}
                        className="text-primary hover:underline"
                      >
                        {r.po_reference ?? r.po_id.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">{r.item_count}</TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(r.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <GrnVoidButton
                      grnId={r.id}
                      referenceLabel={r.reference}
                      onVoided={onVoided}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
