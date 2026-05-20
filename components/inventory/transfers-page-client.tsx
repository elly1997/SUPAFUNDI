"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { createStockTransfer, listStockTransfers } from "@/lib/actions/transfers";
import { usePosProducts } from "@/hooks/usePosProducts";
import { useAuthStore } from "@/stores/authStore";

type Line = { productId: string; name: string; requestedQty: number };

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-700",
  approved: "text-blue-700",
  dispatched: "text-purple-700",
  received: "text-green-700",
  cancelled: "text-muted-foreground",
};

export function TransfersPageClient() {
  const defaultOutlet = useAuthStore((s) => s.activeOutletId);
  const [open, setOpen] = useState(false);
  const [fromOutletId, setFromOutletId] = useState(defaultOutlet ?? "");
  const [toOutletId, setToOutletId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [qty, setQty] = useState(1);
  const queryClient = useQueryClient();

  const { data: transfers = [], isLoading } = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: listStockTransfers,
  });
  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const { data: products = [] } = usePosProducts(fromOutletId || null);

  const createMut = useMutation({
    mutationFn: createStockTransfer,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transfer created (pending approval)");
        setOpen(false);
        setLines([]);
        queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
      } else toast.error(r.message);
    },
  });

  const addLine = () => {
    const p = products.find((x) => x.id === pickProduct);
    if (!p || qty <= 0) return;
    if (p.stockQty < qty) {
      toast.error(`Only ${p.stockQty} in stock at source outlet`);
      return;
    }
    setLines((prev) => [
      ...prev.filter((l) => l.productId !== p.id),
      { productId: p.id, name: p.name, requestedQty: qty },
    ]);
    setPickProduct("");
    setQty(1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ArrowLeftRight className="h-5 w-5" />
          Stock transfers
        </CardTitle>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New transfer
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : transfers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No transfers yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link
                      href={`/inventory/transfers/${t.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.reference_no ?? t.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>{t.from_outlet_name ?? "—"}</TableCell>
                  <TableCell>{t.to_outlet_name ?? "—"}</TableCell>
                  <TableCell>{t.item_count}</TableCell>
                  <TableCell
                    className={`capitalize ${STATUS_COLORS[t.status] ?? ""}`}
                  >
                    {t.status}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request stock transfer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>From outlet</Label>
                <Select
                  value={fromOutletId}
                  onValueChange={(v) => setFromOutletId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To outlet</Label>
                <Select
                  value={toOutletId}
                  onValueChange={(v) => setToOutletId(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets
                      .filter((o) => o.id !== fromOutletId)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
              <div className="min-w-[140px] flex-1 space-y-1">
                <Label>Product</Label>
                <Select
                  value={pickProduct}
                  onValueChange={(v) => setPickProduct(v ?? "")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} (stock: {p.stockQty})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Qty</Label>
                <Input
                  type="number"
                  className="w-20"
                  min={0.001}
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </div>
              <Button type="button" variant="secondary" onClick={addLine}>
                Add
              </Button>
            </div>
            {lines.length > 0 && (
              <ul className="space-y-1 text-sm">
                {lines.map((l) => (
                  <li key={l.productId}>
                    {l.name} × {l.requestedQty}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={
                !fromOutletId ||
                !toOutletId ||
                fromOutletId === toOutletId ||
                lines.length === 0 ||
                createMut.isPending
              }
              onClick={() =>
                createMut.mutate({
                  fromOutletId,
                  toOutletId,
                  lines: lines.map((l) => ({
                    productId: l.productId,
                    requestedQty: l.requestedQty,
                  })),
                })
              }
            >
              {createMut.isPending ? "Saving…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
