"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { getPurchaseOrderById } from "@/lib/actions/purchase-orders";
import {
  cancelPurchaseOrderApi,
  receiveFromPurchaseOrderApi,
  sendPurchaseOrderApi,
} from "@/lib/api/daily-ops-fetch";
import { formatTzs } from "@/lib/utils/currency";

type Props = { poId: string };

export function PurchaseOrderDetailClient({ poId }: Props) {
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<
    "on_account" | "cash" | "mpesa" | "bank_transfer"
  >("on_account");
  const queryClient = useQueryClient();

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: () => getPurchaseOrderById(poId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
    queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  const sendMut = useMutation({
    mutationFn: () => sendPurchaseOrderApi(poId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("PO marked as sent");
        invalidate();
      } else toast.error(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelPurchaseOrderApi(poId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("PO cancelled");
        invalidate();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Cancel failed"),
  });

  const receiveMut = useMutation({
    mutationFn: receiveFromPurchaseOrderApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Goods received and posted to GL");
        setReceiveQty({});
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Receive failed"),
  });

  if (isLoading || !po) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const canSend = po.status === "draft";
  const canReceive = ["sent", "partial"].includes(po.status);
  const canCancel = !["received", "cancelled"].includes(po.status);

  const receiveLines = po.items
    .filter((i) => i.product_id && (receiveQty[i.product_id] ?? 0) > 0)
    .map((i) => ({
      productId: i.product_id!,
      quantity: receiveQty[i.product_id!] ?? 0,
    }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{po.reference_no ?? "Purchase order"}</CardTitle>
            <p className="text-sm capitalize text-muted-foreground">
              {po.status} · {po.supplier_name ?? "No supplier"} ·{" "}
              {po.outlet_name}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canSend && (
              <Button onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
                Mark sent
              </Button>
            )}
            {canCancel && (
              <Button
                variant="outline"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground">Subtotal</span>
            <p className="font-medium">{formatTzs(po.subtotal)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">VAT</span>
            <p className="font-medium">{formatTzs(po.tax_amount)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-medium">{formatTzs(po.total_amount)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Unit cost</TableHead>
                {canReceive && <TableHead className="text-right">Receive now</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.product_name}
                    {item.product_code ? ` (${item.product_code})` : ""}
                  </TableCell>
                  <TableCell className="text-right">{item.ordered_qty}</TableCell>
                  <TableCell className="text-right">{item.received_qty}</TableCell>
                  <TableCell className="text-right">{item.remaining_qty}</TableCell>
                  <TableCell className="text-right">
                    {formatTzs(item.unit_cost)}
                  </TableCell>
                  {canReceive && (
                    <TableCell className="text-right">
                      {item.remaining_qty > 0 && item.product_id ? (
                        <Input
                          type="number"
                          className="ml-auto w-24 text-right"
                          min={0}
                          max={item.remaining_qty}
                          step="any"
                          value={receiveQty[item.product_id] ?? ""}
                          onChange={(e) =>
                            setReceiveQty((prev) => ({
                              ...prev,
                              [item.product_id!]: Number(e.target.value) || 0,
                            }))
                          }
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canReceive && (
        <Card>
          <CardHeader>
            <CardTitle>Receive against PO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Payment on receipt</Label>
              <select
                className="flex h-9 w-full max-w-xs rounded-lg border border-border bg-secondary px-3 text-sm"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as
                      | "on_account"
                      | "cash"
                      | "mpesa"
                      | "bank_transfer"
                  )
                }
              >
                <option value="on_account">On account (AP)</option>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
            <Button
              disabled={receiveLines.length === 0 || receiveMut.isPending}
              onClick={() =>
                receiveMut.mutate({
                  poId,
                  lines: receiveLines,
                  paymentMethod,
                  taxRate: 18,
                })
              }
            >
              {receiveMut.isPending ? "Receiving…" : "Receive & post to GL"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
