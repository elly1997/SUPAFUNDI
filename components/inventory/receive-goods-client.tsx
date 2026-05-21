"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { listSuppliersForOrg, receiveGoods } from "@/lib/actions/grn";
import { usePosProducts } from "@/hooks/usePosProducts";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Line = { productId: string; name: string; quantity: number; unitCost: number };

export function ReceiveGoodsClient() {
  const defaultOutlet = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const [outletId, setOutletId] = useState(defaultOutlet ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "on_account" | "cash" | "mpesa" | "bank_transfer"
  >("on_account");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);

  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: listSuppliersForOrg,
  });
  const { data: products = [] } = usePosProducts(outletId || null);

  const receiveMut = useMutation({
    mutationFn: receiveGoods,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Goods received and posted to GL");
        setLines([]);
      } else toast.error(r.message);
    },
  });

  const addLine = () => {
    const p = products.find((x) => x.id === pickProduct);
    if (!p || qty <= 0) return;
    setLines((prev) => [
      ...prev.filter((l) => l.productId !== p.id),
      {
        productId: p.id,
        name: p.name,
        quantity: qty,
        unitCost: unitCost || p.costPrice,
      },
    ]);
    setPickProduct("");
    setQty(1);
    setUnitCost(0);
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackagePlus className="h-5 w-5" />
          Receive goods (GRN)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <DatePicker
          label="Received on (business date)"
          value={businessDate}
          onChange={setBusinessDate}
          showPresets={false}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Outlet</Label>
            <Select
              value={outletId}
              onValueChange={(v) => setOutletId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select outlet" />
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
            <Label>Supplier (optional)</Label>
            <Select
              value={supplierId || "__none__"}
              onValueChange={(v) =>
                setSupplierId(!v || v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Payment</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) =>
                setPaymentMethod(
                  v as "on_account" | "cash" | "mpesa" | "bank_transfer"
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_account">On account (AP)</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mpesa">M-Pesa</SelectItem>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>Product</Label>
            <Select
              value={pickProduct}
              onValueChange={(v) => setPickProduct(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Qty</Label>
            <Input
              type="number"
              min={0.001}
              step="any"
              className="w-24"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Unit cost</Label>
            <Input
              type="number"
              min={0}
              className="w-28"
              value={unitCost || ""}
              onChange={(e) => setUnitCost(Number(e.target.value))}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addLine}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>

        {lines.length > 0 && (
          <ul className="space-y-2 text-sm">
            {lines.map((l) => (
              <li
                key={l.productId}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <span>
                  {l.name} × {l.quantity} @ {formatTzs(l.unitCost)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLines((prev) =>
                      prev.filter((x) => x.productId !== l.productId)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
            <p className="font-semibold">Subtotal: {formatTzs(subtotal)}</p>
          </ul>
        )}

        <Button
          disabled={!outletId || lines.length === 0 || receiveMut.isPending}
          onClick={() =>
            receiveMut.mutate({
              outletId,
              supplierId: supplierId || null,
              paymentMethod,
              taxRate: 18,
              businessDate,
              lines: lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                unitCost: l.unitCost,
              })),
            })
          }
        >
          {receiveMut.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Posting…
            </>
          ) : (
            "Receive & post to GL"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
