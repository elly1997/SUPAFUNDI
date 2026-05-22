"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Undo2 } from "lucide-react";
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
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { fetchSupplierOptions } from "@/lib/api/suppliers-fetch";
import { createSupplierReturn } from "@/lib/actions/supplier-returns";
import { usePosProducts } from "@/hooks/usePosProducts";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

export function SupplierReturnsClient() {
  const defaultOutlet = useAuthStore((s) => s.activeOutletId);
  const [outletId, setOutletId] = useState(defaultOutlet ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    "on_account" | "cash" | "mpesa" | "bank_transfer"
  >("on_account");

  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSupplierOptions,
  });
  const { data: products = [] } = usePosProducts(outletId || null);

  const returnMut = useMutation({
    mutationFn: createSupplierReturn,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Return posted — stock reduced");
        setProductId("");
        setQty(1);
        setUnitCost(0);
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="size-5" />
          Return goods to supplier
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Label>Supplier</Label>
            <Select
              value={supplierId || "__none__"}
              onValueChange={(v) =>
                setSupplierId(!v || v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
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
            <Label>Settlement</Label>
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
                <SelectItem value="on_account">Reduce AP</SelectItem>
                <SelectItem value="cash">Cash refund</SelectItem>
                <SelectItem value="mpesa">M-Pesa refund</SelectItem>
                <SelectItem value="bank_transfer">Bank refund</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>Product</Label>
            <Select
              value={productId}
              onValueChange={(v) => setProductId(v ?? "")}
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
        </div>

        {productId && qty > 0 && (
          <p className="text-sm text-muted-foreground">
            Return value: {formatTzs(qty * unitCost)}
          </p>
        )}

        <Button
          disabled={!outletId || !productId || returnMut.isPending}
          onClick={() =>
            returnMut.mutate({
              outletId,
              supplierId: supplierId || null,
              paymentMethod,
              lines: [{ productId, quantity: qty, unitCost }],
            })
          }
        >
          {returnMut.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Posting…
            </>
          ) : (
            "Post return"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
