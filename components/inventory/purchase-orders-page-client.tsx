"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, CreditCard, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { listPurchaseOrders } from "@/lib/actions/purchase-orders";
import { PoPayDialog } from "@/components/procurement/po-pay-dialog";
import { PoStatusBadges } from "@/components/procurement/po-status-badges";
import { createPurchaseOrderApi } from "@/lib/api/daily-ops-fetch";
import {
  createSupplierApi,
  fetchSupplierOptions,
  invalidateSupplierQueries,
} from "@/lib/api/suppliers-fetch";
import { isPoPaid } from "@/lib/procurement/po-payment";
import { usePosProducts } from "@/hooks/usePosProducts";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

type Line = {
  productId: string;
  name: string;
  orderedQty: number;
  unitCost: number;
};

const selectFieldClass =
  "h-10 w-full min-w-0 rounded-lg bg-surface-1 font-sans text-sm";

export function PurchaseOrdersPageClient() {
  const defaultOutlet = useAuthStore((s) => s.activeOutletId);
  const [open, setOpen] = useState(false);
  const [outletId, setOutletId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [newSupplier, setNewSupplier] = useState("");
  const [payPo, setPayPo] = useState<{
    id: string;
    reference: string | null;
    supplier: string | null;
    total: number;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: listPurchaseOrders,
  });
  const { data: outlets = [], isLoading: outletsLoading } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSupplierOptions,
  });
  const { data: products = [] } = usePosProducts(outletId || null);

  const outletLabel = useMemo(
    () => outlets.find((o) => o.id === outletId)?.name,
    [outlets, outletId]
  );

  useEffect(() => {
    if (!open || outlets.length === 0) return;
    const valid = outlets.some((o) => o.id === outletId);
    if (!valid) {
      const fallback = resolveDefaultOutletId(outlets) ?? outlets[0]?.id;
      const next =
        defaultOutlet && outlets.some((o) => o.id === defaultOutlet)
          ? defaultOutlet
          : fallback;
      if (next) setOutletId(next);
    }
  }, [open, outlets, outletId, defaultOutlet]);

  const openDialog = () => {
    setLines([]);
    setPickProduct("");
    setQty(1);
    setUnitCost(0);
    setSupplierId("");
    setNewSupplier("");
    if (outlets.length > 0) {
      const fallback = resolveDefaultOutletId(outlets) ?? outlets[0]?.id;
      const next =
        defaultOutlet && outlets.some((o) => o.id === defaultOutlet)
          ? defaultOutlet
          : fallback;
      if (next) setOutletId(next);
    }
    setOpen(true);
  };

  const createMut = useMutation({
    mutationFn: createPurchaseOrderApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Purchase order created (draft)");
        setOpen(false);
        setLines([]);
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Create PO failed"),
  });

  const addLine = () => {
    const p = products.find((x) => x.id === pickProduct);
    if (!p || qty <= 0) return;
    setLines((prev) => [
      ...prev.filter((l) => l.productId !== p.id),
      {
        productId: p.id,
        name: p.name,
        orderedQty: qty,
        unitCost: unitCost || p.costPrice,
      },
    ]);
    setPickProduct("");
    setQty(1);
    setUnitCost(0);
  };

  const addSupplierMut = useMutation({
    mutationFn: (name: string) => createSupplierApi({ name }),
    onSuccess: async (r) => {
      if (r.ok) {
        toast.success("Supplier added");
        setSupplierId(r.id);
        setNewSupplier("");
        await refetchSuppliers();
        invalidateSupplierQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not add supplier"),
  });

  const linesTotal = lines.reduce(
    (s, l) => s + l.orderedQty * l.unitCost,
    0
  );

  return (
    <Card className="glass-card font-sans">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 font-sans text-lg font-semibold">
          <ClipboardList className="size-5 text-primary" />
          Purchase orders
        </CardTitle>
        <Button onClick={openDialog} className="rounded-lg">
          <Plus className="mr-2 size-4" />
          New PO
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No purchase orders yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/inventory/purchase-orders/${o.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.reference_no ?? o.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>{o.supplier_name ?? "—"}</TableCell>
                  <TableCell>{o.outlet_name ?? "—"}</TableCell>
                  <TableCell>{o.order_date}</TableCell>
                  <TableCell>
                    <PoStatusBadges
                      status={o.status}
                      paymentStatus={o.payment_status}
                      paymentMethod={o.payment_method}
                      paidAt={o.paid_at}
                      source={o.source}
                    />
                  </TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(o.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/inventory/purchase-orders/${o.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" })
                        )}
                      >
                        Details
                      </Link>
                      {!isPoPaid(o.payment_status) && o.supplier_name ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          onClick={() =>
                            setPayPo({
                              id: o.id,
                              reference: o.reference_no,
                              supplier: o.supplier_name,
                              total: o.total_amount,
                            })
                          }
                        >
                          <CreditCard className="size-3.5" />
                          Pay
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {payPo ? (
        <PoPayDialog
          open={!!payPo}
          onOpenChange={(v) => !v && setPayPo(null)}
          poId={payPo.id}
          referenceNo={payPo.reference}
          supplierName={payPo.supplier}
          totalAmount={payPo.total}
          onPaid={() => {
            setPayPo(null);
            void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
          }}
        />
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(92vh,720px)] overflow-y-auto font-sans sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-sans text-lg font-semibold">
              New purchase order
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Delivery outlet
                </Label>
                {outletsLoading ? (
                  <div className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading outlets…
                  </div>
                ) : outlets.length === 0 ? (
                  <p className="text-sm text-destructive">
                    No outlets — add one in Settings first.
                  </p>
                ) : (
                  <Select
                    value={outletId || undefined}
                    onValueChange={(v) => setOutletId(v ?? "")}
                  >
                    <SelectTrigger className={selectFieldClass}>
                      <SelectValue placeholder="Select outlet">
                        {outletLabel ?? "Select outlet"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="min-w-0 space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Supplier
                </Label>
                <Select
                  value={supplierId || "none"}
                  onValueChange={(v) =>
                    setSupplierId(!v || v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger className={selectFieldClass}>
                    <SelectValue placeholder="Optional supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No supplier</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                Add supplier (optional)
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="h-10 flex-1 rounded-lg bg-surface-1 font-sans"
                  placeholder="New supplier name"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0 rounded-lg sm:w-24"
                  disabled={!newSupplier.trim() || addSupplierMut.isPending}
                  onClick={() => addSupplierMut.mutate(newSupplier)}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
              <p className="text-sm font-semibold">Order lines</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                <div className="min-w-0 space-y-1.5 sm:col-span-5">
                  <Label className="text-xs text-muted-foreground">Product</Label>
                  <Select
                    value={pickProduct || undefined}
                    onValueChange={(v) => setPickProduct(v ?? "")}
                    disabled={!outletId}
                  >
                    <SelectTrigger className={selectFieldClass}>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number"
                    className="h-10 w-full rounded-lg bg-surface-1 font-sans"
                    min={0.001}
                    step="any"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label className="text-xs text-muted-foreground">
                    Unit cost
                  </Label>
                  <Input
                    type="number"
                    className="h-10 w-full rounded-lg bg-surface-1 font-money"
                    min={0}
                    placeholder="0"
                    value={unitCost || ""}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-full rounded-lg"
                    onClick={addLine}
                    disabled={!pickProduct}
                  >
                    Add line
                  </Button>
                </div>
              </div>

              {lines.length > 0 && (
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {lines.map((l) => (
                    <li
                      key={l.productId}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {l.name}{" "}
                        <span className="text-muted-foreground">
                          × {l.orderedQty} @ {formatTzs(l.unitCost)}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Remove line"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((x) => x.productId !== l.productId)
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {lines.length > 0 && (
                <p className="text-right text-sm font-semibold">
                  Est. total:{" "}
                  <span className="font-money text-primary">
                    {formatTzs(linesTotal)}
                  </span>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className={cn("rounded-lg btn-primary-gradient")}
              disabled={
                !outletId || lines.length === 0 || createMut.isPending
              }
              onClick={() =>
                createMut.mutate({
                  outletId,
                  supplierId: supplierId || null,
                  taxRate: 18,
                  lines: lines.map((l) => ({
                    productId: l.productId,
                    orderedQty: l.orderedQty,
                    unitCost: l.unitCost,
                  })),
                })
              }
            >
              {createMut.isPending ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
