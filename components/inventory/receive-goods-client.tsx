"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  Loader2,
  PackagePlus,
  Plus,
  Trash2,
  Truck,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { IncomingTransfersPanel } from "@/components/inventory/incoming-transfers-panel";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { receiveGoodsApi } from "@/lib/api/daily-ops-fetch";
import {
  createSupplierApi,
  fetchSupplierOptions,
  invalidateSupplierQueries,
} from "@/lib/api/suppliers-fetch";
import {
  createProductQuickApi,
  fetchProductPriceCatalog,
} from "@/lib/api/inventory-catalog-fetch";
import { useTaxRate } from "@/hooks/useTaxRate";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { cn } from "@/lib/utils";
import { retailPriceFromCost } from "@/lib/utils/calculations";
import { formatTzs } from "@/lib/utils/currency";
import { useOrgSettingsStore } from "@/stores/orgSettingsStore";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Line = { productId: string; name: string; quantity: number; unitCost: number };

type ReceivePickProduct = {
  id: string;
  name: string;
  code: string | null;
  costPrice: number;
};

const selectFieldClass =
  "h-9 w-full min-w-0 rounded-lg bg-surface-1 font-sans text-sm";

const GRN_SUPPLIER_KEY = "supafundi-grn-supplier-draft";

type GrnSupplierDraft = {
  outletId: string;
  supplierId: string;
  supplierName: string;
};

export function ReceiveGoodsClient() {
  const queryClient = useQueryClient();
  const taxRate = useTaxRate();
  const retailMarginPct = useOrgSettingsStore((s) => s.defaultRetailMarginPct);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const sessionOutletId = useAuthStore((s) => s.session?.outletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const [outletId, setOutletId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [stickySupplierName, setStickySupplierName] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "on_account" | "cash" | "mpesa" | "bank_transfer"
  >("on_account");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickProduct, setPickProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("General");
  const [pendingPick, setPendingPick] = useState<ReceivePickProduct | null>(
    null
  );

  const { data: outlets = [], isLoading: outletsLoading } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });

  const {
    data: suppliers = [],
    refetch: refetchSuppliers,
    isError: suppliersError,
    error: suppliersLoadError,
  } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSupplierOptions,
  });

  const {
    data: catalogProducts = [],
    refetch: refetchCatalog,
  } = useQuery({
    queryKey: ["product-price-catalog", outletId],
    queryFn: () => fetchProductPriceCatalog(outletId),
    enabled: !!outletId,
  });

  const products = useMemo((): ReceivePickProduct[] => {
    const rows: ReceivePickProduct[] = catalogProducts.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      costPrice: p.costPrice,
    }));
    if (pendingPick && !rows.some((r) => r.id === pendingPick.id)) {
      return [pendingPick, ...rows];
    }
    return rows;
  }, [catalogProducts, pendingPick]);

  const outletLabel = useMemo(
    () => outlets.find((o) => o.id === outletId)?.name,
    [outlets, outletId]
  );

  const supplierDisplayName = useMemo(() => {
    if (!supplierId) return null;
    return (
      stickySupplierName ||
      suppliers.find((s) => s.id === supplierId)?.name ||
      null
    );
  }, [supplierId, stickySupplierName, suppliers]);

  const setSupplier = (id: string, name?: string) => {
    setSupplierId(id);
    if (!id) {
      setStickySupplierName("");
      try {
        sessionStorage.removeItem(GRN_SUPPLIER_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const resolved =
      name ?? suppliers.find((s) => s.id === id)?.name ?? stickySupplierName;
    if (resolved) setStickySupplierName(resolved);
  };

  useEffect(() => {
    if (!outletId || !supplierId || !supplierDisplayName) return;
    try {
      sessionStorage.setItem(
        GRN_SUPPLIER_KEY,
        JSON.stringify({
          outletId,
          supplierId,
          supplierName: supplierDisplayName,
        } satisfies GrnSupplierDraft)
      );
    } catch {
      /* ignore */
    }
  }, [outletId, supplierId, supplierDisplayName]);

  useEffect(() => {
    if (!outletId) return;
    try {
      const raw = sessionStorage.getItem(GRN_SUPPLIER_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as GrnSupplierDraft;
      if (draft.outletId === outletId && draft.supplierId) {
        setSupplierId(draft.supplierId);
        setStickySupplierName(draft.supplierName);
      }
    } catch {
      /* ignore */
    }
  }, [outletId]);

  useEffect(() => {
    if (outlets.length === 0) return;
    const valid = outlets.some((o) => o.id === outletId);
    if (valid) return;
    const next = resolveActiveOutletId(outlets, {
      stored: activeOutletId,
      profileOutletId: sessionOutletId,
    });
    if (next) setOutletId(next);
  }, [outlets, outletId, activeOutletId, sessionOutletId]);

  useEffect(() => {
    setPendingPick(null);
    setPickProduct("");
  }, [outletId]);

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.code ? `${p.name} (${p.code})` : p.name,
        keywords: `${p.name} ${p.code ?? ""}`,
      })),
    [products]
  );

  const pickDisplayLabel = useMemo(() => {
    if (!pickProduct) return undefined;
    const p = products.find((x) => x.id === pickProduct);
    if (!p) return undefined;
    return p.code ? `${p.name} (${p.code})` : p.name;
  }, [pickProduct, products]);

  const addProductMut = useMutation({
    mutationFn: () => {
      if (!outletId) throw new Error("Select an outlet first");
      const name = newProductName.trim();
      if (!name) throw new Error("Enter a product name");
      const cost = unitCost > 0 ? unitCost : 0;
      return createProductQuickApi({
        name,
        outletId,
        categoryName: newProductCategory.trim() || "General",
        costPrice: cost,
        retailPrice: retailPriceFromCost(cost, retailMarginPct),
      });
    },
    onSuccess: async (r) => {
      if (r.ok) {
        const createdName = newProductName.trim() || "New product";
        const created: ReceivePickProduct = {
          id: r.productId,
          name: createdName,
          code: r.code ?? null,
          costPrice: unitCost > 0 ? unitCost : 0,
        };
        setPendingPick(created);
        setPickProduct(r.productId);
        setNewProductName("");
        toast.success(
          unitCost > 0
            ? "Product added — set qty and tap Add line"
            : "Product added — enter unit cost, qty, then Add line"
        );
        await refetchCatalog();
        void queryClient.invalidateQueries({
          queryKey: ["product-price-catalog"],
        });
        void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not add product"),
  });

  const addSupplierMut = useMutation({
    mutationFn: (name: string) => createSupplierApi({ name }),
    onSuccess: async (r) => {
      if (r.ok) {
        const name = newSupplier.trim();
        toast.success("Supplier added");
        setSupplier(r.id, name);
        setNewSupplier("");
        await refetchSuppliers();
        invalidateSupplierQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not add supplier"),
  });

  const receiveMut = useMutation({
    mutationFn: receiveGoodsApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Goods received · PO recorded", {
          action: r.poId
            ? {
                label: "View PO",
                onClick: () => {
                  window.location.href = `/inventory/purchase-orders/${r.poId}`;
                },
              }
            : undefined,
        });
        setLines([]);
        void queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
        void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
        void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
        void queryClient.invalidateQueries({ queryKey: ["payables-open"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Receive failed"),
  });

  const addLine = () => {
    const p = products.find((x) => x.id === pickProduct);
    if (!p || qty <= 0) {
      toast.error("Select a product and enter quantity");
      return;
    }
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
    setPendingPick(null);
    setQty(1);
    setUnitCost(0);
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link
          href="/inventory/stock"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Warehouse className="mr-1.5 size-4" />
          Stock levels
        </Link>
        <Link
          href="/inventory/purchase-orders"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ClipboardList className="mr-1.5 size-4" />
          Purchase orders
        </Link>
        <Link
          href="/suppliers"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <Truck className="mr-1.5 size-4" />
          Supplier registry
        </Link>
      </div>

      <IncomingTransfersPanel outletId={outletId || null} />

      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" />
            Receive goods (GRN)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="space-y-4" aria-labelledby="grn-delivery-heading">
            <h3
              id="grn-delivery-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              1. Delivery details
            </h3>
            <DatePicker
              label="Received on (business date)"
              value={businessDate}
              onChange={setBusinessDate}
              showPresets={false}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Outlet</Label>
              {outletsLoading ? (
                <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading outlets…
                </div>
              ) : outlets.length === 0 ? (
                <p className="text-sm text-destructive">
                  No outlets —{" "}
                  <Link href="/settings/outlets" className="underline">
                    add one in Settings
                  </Link>
                  .
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
                        {o.code ? ` (${o.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
                <SelectTrigger className={selectFieldClass}>
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
          </section>

          <section className="space-y-4" aria-labelledby="grn-supplier-heading">
            <h3
              id="grn-supplier-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              2. Supplier
            </h3>
            {supplierDisplayName ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
                <p className="text-sm">
                  <span className="text-muted-foreground">Supplier for this receipt: </span>
                  <span className="font-semibold text-foreground">
                    {supplierDisplayName}
                  </span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSupplier("")}
                >
                  Change supplier
                </Button>
              </div>
            ) : null}
            {suppliersError ? (
              <p className="text-sm text-destructive">
                Could not load suppliers:{" "}
                {suppliersLoadError instanceof Error
                  ? suppliersLoadError.message
                  : "Refresh the page"}
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="grn-supplier">Supplier (optional)</Label>
              <Select
                value={supplierId || "none"}
                onValueChange={(v) =>
                  setSupplier(!v || v === "none" ? "" : v)
                }
              >
                <SelectTrigger id="grn-supplier" className={selectFieldClass}>
                  <SelectValue placeholder="No supplier">
                    {supplierDisplayName ?? "No supplier"}
                  </SelectValue>
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
            <div className="rounded-lg border border-border bg-muted/20 p-3">
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              Add supplier (if not in the list)
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                className="h-9 flex-1 rounded-lg bg-surface-1"
                placeholder="New supplier name"
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newSupplier.trim()) addSupplierMut.mutate(newSupplier.trim());
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 sm:w-28"
                disabled={!newSupplier.trim() || addSupplierMut.isPending}
                onClick={() => addSupplierMut.mutate(newSupplier.trim())}
              >
                {addSupplierMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Add supplier"
                )}
              </Button>
            </div>
          </div>
          </section>

          <section className="space-y-4" aria-labelledby="grn-lines-heading">
            <h3
              id="grn-lines-heading"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              3. Line items
            </h3>
            <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="grn-product">Product</Label>
                <SearchableSelect
                  options={productOptions}
                  value={pickProduct}
                  selectedLabel={pickDisplayLabel}
                  onValueChange={(id) => {
                    setPickProduct(id);
                    const p = products.find((x) => x.id === id);
                    if (p) setUnitCost(p.costPrice);
                    if (id !== pendingPick?.id) setPendingPick(null);
                  }}
                  placeholder={
                    outletId ? "Search name or code…" : "Select outlet first"
                  }
                  searchPlaceholder="Search product name or code…"
                  disabled={!outletId}
                  emptyMessage={
                    outletId
                      ? "No match — add a new product below"
                      : "Select an outlet first"
                  }
                  minPanelWidth={320}
                  maxVisible={120}
                  className="w-full"
                />
                {!outletId ? (
                  <p className="text-xs text-muted-foreground">
                    Choose an outlet to load products for that branch.
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  Add product (if not in the list)
                </Label>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      className="h-9 flex-1 rounded-lg bg-surface-1"
                      placeholder="New product name"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      disabled={!outletId}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newProductName.trim() && outletId) {
                            addProductMut.mutate();
                          }
                        }
                      }}
                    />
                    <Input
                      className="h-9 w-full rounded-lg bg-surface-1 sm:w-36"
                      placeholder="Category"
                      value={newProductCategory}
                      onChange={(e) => setNewProductCategory(e.target.value)}
                      disabled={!outletId}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 shrink-0 sm:w-32"
                      disabled={
                        !outletId ||
                        !newProductName.trim() ||
                        addProductMut.isPending
                      }
                      onClick={() => addProductMut.mutate()}
                    >
                      {addProductMut.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Add product"
                      )}
                    </Button>
                  </div>
                  <p className="form-hint text-xs text-muted-foreground">
                    Retail = cost + {retailMarginPct}% margin (from unit cost above).
                    Change margin in Settings → General. Stock is added when you
                    receive this GRN.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grn-qty">Qty</Label>
                  <Input
                    id="grn-qty"
                    type="number"
                    min={0.001}
                    step="any"
                    className="w-28 font-money"
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grn-cost">Unit cost (TZS)</Label>
                  <Input
                    id="grn-cost"
                    type="number"
                    min={0}
                    className="w-36 font-money"
                    value={unitCost || ""}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    placeholder={
                      pickProduct
                        ? String(
                            products.find((p) => p.id === pickProduct)
                              ?.costPrice ?? ""
                          )
                        : undefined
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-9"
                  disabled={!pickProduct}
                  onClick={addLine}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add line
                </Button>
              </div>
            </div>
          </section>

          {lines.length > 0 && (
            <ul className="space-y-2 text-sm" aria-label="GRN lines added">
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

          <div className="flex flex-wrap gap-2 border-t border-border pt-6">
            <Button
              type="button"
              disabled={!outletId || lines.length === 0 || receiveMut.isPending}
              onClick={() => {
                if (paymentMethod === "on_account" && !supplierId) {
                  toast.error("Select or add a supplier for on-account purchases");
                  return;
                }
                receiveMut.mutate({
                  outletId,
                  supplierId: supplierId || null,
                  paymentMethod,
                  taxRate,
                  businessDate,
                  lines: lines.map((l) => ({
                    productId: l.productId,
                    quantity: l.quantity,
                    unitCost: l.unitCost,
                  })),
                });
              }}
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
            {paymentMethod === "on_account" && !supplierId ? (
              <p className="self-center text-xs text-warning">
                On-account GRN needs a supplier for AP.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
