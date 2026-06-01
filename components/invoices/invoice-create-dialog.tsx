"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { Button } from "@/components/ui/button";
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
import type { SaleDocumentType } from "@/lib/constants/sale-documents";
import { saleTypeLabel } from "@/lib/constants/sale-documents";
import { createDraftSaleDocument } from "@/lib/actions/invoices";
import { fetchPosCustomers } from "@/lib/api/customers-fetch";
import { fetchProductPriceCatalog } from "@/lib/api/inventory-catalog-fetch";
import { fetchPaymentAccounts } from "@/lib/api/banking-fetch";
import { useTaxRate } from "@/hooks/useTaxRate";
import { computeLineTotal } from "@/lib/utils/calculations";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useQuery } from "@tanstack/react-query";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: SaleDocumentType;
  onCreated: () => void;
};

type DraftLine = {
  key: string;
  productId: string | null;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};

function newLineKey() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function InvoiceCreateDialog({
  open,
  onOpenChange,
  defaultType,
  onCreated,
}: Props) {
  const router = useRouter();
  const taxRate = useTaxRate();
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [customerId, setCustomerId] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [pickProduct, setPickProduct] = useState("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [customName, setCustomName] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: fetchPosCustomers,
    enabled: open,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["product-price-catalog", outletId],
    queryFn: () => fetchProductPriceCatalog(outletId),
    enabled: open && !!outletId,
  });
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: fetchPaymentAccounts,
    enabled: open,
  });

  const productOptions = useMemo(
    () =>
      catalog.map((p) => ({
        value: p.id,
        label: p.code ? `${p.name} (${p.code})` : p.name,
        hint: `${p.stockQty} ${p.unit}`,
        keywords: `${p.name} ${p.code ?? ""} ${p.categoryName} ${p.stockQty}`,
      })),
    [catalog]
  );

  const pickDisplayLabel = useMemo(() => {
    if (!pickProduct) return undefined;
    const p = catalog.find((x) => x.id === pickProduct);
    if (!p) return undefined;
    const base = p.code ? `${p.name} (${p.code})` : p.name;
    return `${base} · ${p.stockQty} ${p.unit}`;
  }, [pickProduct, catalog]);

  useEffect(() => {
    if (!open) return;
    setPickProduct("");
    setQty(1);
    setUnitPrice(0);
    setCustomName("");
    setBankAccountId("");
    setLines([]);
  }, [open, outletId]);

  useEffect(() => {
    const p = catalog.find((x) => x.id === pickProduct);
    if (p) setUnitPrice(p.retailPrice ?? 0);
  }, [pickProduct, catalog]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + computeLineTotal(l.quantity, l.unitPrice, 0),
      0
    );
    return { subtotal, count: lines.length };
  }, [lines]);

  const createMut = useMutation({
    mutationFn: createDraftSaleDocument,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Created ${r.invoiceNo}`);
        onOpenChange(false);
        onCreated();
        router.push(`/invoices/${r.saleId}`);
      } else toast.error(r.message);
    },
  });

  const addCatalogLine = () => {
    const p = catalog.find((x) => x.id === pickProduct);
    if (!p) {
      toast.error("Select a product from the list");
      return;
    }
    if (qty <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (unitPrice < 0) {
      toast.error("Enter a valid unit price");
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id
            ? {
                ...l,
                quantity: l.quantity + qty,
                unitPrice,
              }
            : l
        );
      }
      return [
        ...prev,
        {
          key: newLineKey(),
          productId: p.id,
          productName: p.name,
          unit: p.unit,
          quantity: qty,
          unitPrice,
        },
      ];
    });
    setPickProduct("");
    setQty(1);
    setUnitPrice(0);
  };

  const addCustomLine = () => {
    const name = customName.trim();
    if (!name) {
      toast.error("Enter a description for the custom line");
      return;
    }
    if (unitPrice <= 0) {
      toast.error("Enter amount for the custom line");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: newLineKey(),
        productId: null,
        productName: name,
        unit: "pcs",
        quantity: qty > 0 ? qty : 1,
        unitPrice,
      },
    ]);
    setCustomName("");
    setQty(1);
    setUnitPrice(0);
  };

  const updateLine = (
    key: string,
    patch: Partial<Pick<DraftLine, "quantity" | "unitPrice">>
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  };

  const docLabel = saleTypeLabel(defaultType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New {docLabel.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!outletId) {
              toast.error("Select an outlet first");
              return;
            }
            if (lines.length === 0) {
              toast.error("Add at least one line item");
              return;
            }
            createMut.mutate({
              outletId,
              customerId: customerId || null,
              saleType: defaultType,
              taxRate,
              cartDiscountAmount: 0,
              bankAccountLabel:
                bankAccounts.find((a) => a.id === bankAccountId)?.name || undefined,
              lines: lines.map((l) => ({
                productId: l.productId,
                productName: l.productName,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountPct: 0,
              })),
              validUntil: validUntil || undefined,
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={customerId || "__none__"}
                onValueChange={(v) =>
                  setCustomerId(!v || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Walk-in" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Walk-in</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valid until (optional)</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Bank account for quotation (optional)</Label>
              <Select
                value={bankAccountId || "__none__"}
                onValueChange={(v) =>
                  setBankAccountId(!v || v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No bank account shown</SelectItem>
                  {bankAccounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-card/60 p-4">
            <Label className="text-sm font-medium">Add from catalog</Label>
            <SearchableSelect
              options={productOptions}
              value={pickProduct}
              selectedLabel={pickDisplayLabel}
              onValueChange={setPickProduct}
              placeholder={
                outletId ? "Search product name or code…" : "Select outlet first"
              }
              searchPlaceholder="Search products…"
              disabled={!outletId}
              emptyMessage={
                outletId ? "No matching products" : "Select an outlet first"
              }
              minPanelWidth={360}
              maxVisible={120}
              className="w-full"
            />
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quote-qty">Qty</Label>
                <Input
                  id="quote-qty"
                  type="number"
                  min={0.001}
                  step="any"
                  className="w-24 font-money"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quote-price">Unit price (TZS)</Label>
                <Input
                  id="quote-price"
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-36 font-money"
                  value={unitPrice || ""}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={!pickProduct}
                onClick={addCatalogLine}
              >
                <Plus className="mr-1 size-4" />
                Add product
              </Button>
            </div>
            <div className="border-t border-border pt-3">
              <Label className="text-xs text-muted-foreground">
                Custom line (not in catalog)
              </Label>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <Input
                  className="min-w-[200px] flex-1"
                  placeholder="Description"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addCustomLine}
                >
                  Add custom
                </Button>
              </div>
            </div>
          </div>

          {lines.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-24 text-right">Qty</TableHead>
                    <TableHead className="w-32 text-right">Unit</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => {
                    const lineTotal = computeLineTotal(
                      l.quantity,
                      l.unitPrice,
                      0
                    );
                    return (
                      <TableRow key={l.key}>
                        <TableCell className="font-medium">
                          {l.productName}
                          {l.unit ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({l.unit})
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0.001}
                            step="any"
                            className="ml-auto h-8 w-20 font-money"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(l.key, {
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="ml-auto h-8 w-28 font-money"
                            value={l.unitPrice}
                            onChange={(e) =>
                              updateLine(l.key, {
                                unitPrice: Number(e.target.value),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-money">
                          {formatTzs(lineTotal)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((x) => x.key !== l.key)
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="border-t px-3 py-2 text-right text-sm font-semibold">
                Subtotal:{" "}
                <span className="font-money">{formatTzs(totals.subtotal)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add products from the dropdown to build the {docLabel.toLowerCase()}.
              You can print a letterhead PDF after saving.
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMut.isPending || lines.length === 0}
            >
              {createMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save & open"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
