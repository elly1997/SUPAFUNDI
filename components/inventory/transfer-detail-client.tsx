"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canApproveStockTransfers,
  isUserRole,
} from "@/lib/auth/roles";
import {
  approveStockTransfer,
  cancelStockTransfer,
  dispatchStockTransfer,
  getStockTransferById,
  receiveStockTransfer,
} from "@/lib/actions/transfers";
import { formatDateTimeEAT } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

type Props = { transferId: string };

export function TransferDetailClient({ transferId }: Props) {
  const queryClient = useQueryClient();
  const sessionRole = useAuthStore((s) => s.session?.role ?? null);
  const role = isUserRole(sessionRole ?? "") ? sessionRole : null;
  const canApprove = canApproveStockTransfers(role);
  const { data: tr, isLoading } = useQuery({
    queryKey: ["stock-transfer", transferId],
    queryFn: () => getStockTransferById(transferId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["stock-transfer", transferId] });
    queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["incoming-transfers"] });
    queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["pos-products"] });
    queryClient.invalidateQueries({ queryKey: ["inbox"] });
    queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
  };

  const approveMut = useMutation({
    mutationFn: () => approveStockTransfer(transferId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Approved and sent");
        invalidate();
      } else toast.error(r.message);
    },
  });
  const dispatchMut = useMutation({
    mutationFn: () => dispatchStockTransfer(transferId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Stock dispatched");
        invalidate();
      } else toast.error(r.message);
    },
  });
  const receiveMut = useMutation({
    mutationFn: () => receiveStockTransfer(transferId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transfer received");
        invalidate();
      } else toast.error(r.message);
    },
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelStockTransfer(transferId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transfer cancelled");
        invalidate();
      } else toast.error(r.message);
    },
  });

  if (isLoading || !tr) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const pending = tr.status === "pending";
  const approved = tr.status === "approved";
  const dispatched = tr.status === "dispatched";
  const canCancel = pending || approved;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{tr.reference_no ?? "Stock transfer"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {tr.from_outlet_name} → {tr.to_outlet_name}
            </p>
            <p className="text-xs capitalize text-muted-foreground">
              Status: {tr.status}
              {tr.dispatched_at &&
                ` · Dispatched ${formatDateTimeEAT(tr.dispatched_at)}`}
              {tr.received_at &&
                ` · Received ${formatDateTimeEAT(tr.received_at)}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {pending && canApprove && (
              <Button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                Approve & send
              </Button>
            )}
            {pending && !canApprove && (
              <p className="text-sm text-amber-600">
                Waiting in owner/manager Inbox
              </p>
            )}
            {approved && (
              <Button onClick={() => dispatchMut.mutate()} disabled={dispatchMut.isPending}>
                Send stock
              </Button>
            )}
            {dispatched && (
              <Button onClick={() => receiveMut.mutate()} disabled={receiveMut.isPending}>
                Confirm received
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
        {tr.notes && (
          <CardContent className="text-sm text-muted-foreground">{tr.notes}</CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Dispatched</TableHead>
                <TableHead className="text-right">Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tr.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.product_name}
                    {item.product_code ? ` (${item.product_code})` : ""}
                  </TableCell>
                  <TableCell className="text-right">{item.requested_qty}</TableCell>
                  <TableCell className="text-right">
                    {item.dispatched_qty ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.received_qty ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-muted">
        <CardContent className="py-4 text-sm text-muted-foreground">
          <strong>Workflow:</strong> Send (or request) → Owner/manager Approve
          & send from Inbox → Destination confirms receipt. Each branch keeps
          its own catalog and document numbers.

        </CardContent>
      </Card>
    </div>
  );
}
