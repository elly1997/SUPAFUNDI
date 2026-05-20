"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useProducts } from "@/hooks/useProducts";
import {
  adjustProductStock,
  createProduct,
  getProductStockSnapshot,
  listCategoriesForOrg,
} from "@/lib/actions/inventory";
import { importInventoryInChunks } from "@/lib/api/inventory-import-fetch";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { formatTzs } from "@/lib/utils/currency";
import type { ProductListRow } from "@/hooks/useProducts";
import { downloadInventoryTemplate } from "@/lib/excel/inventory-template";
import {
  parseInventoryWorkbook,
  type InventoryImportRow,
} from "@/lib/excel/parse-inventory";
import { generateProductCode } from "@/lib/products/sku";

const addProductSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    categoryId: z.string(),
    newCategoryName: z.string().optional(),
    unit: z.string().min(1, "Unit is required"),
    code: z.string().optional(),
    retailPrice: z.coerce.number().nonnegative(),
    costPrice: z.coerce.number().nonnegative(),
    quantity: z.coerce.number().nonnegative(),
    outletId: z.string().min(1, "Outlet is required"),
  })
  .superRefine((data, ctx) => {
    if (data.categoryId === "__new__") {
      if (!data.newCategoryName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a name for the new category.",
          path: ["newCategoryName"],
        });
      }
    } else if (!data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a category.",
        path: ["categoryId"],
      });
    }
  });

type AddProductForm = z.infer<typeof addProductSchema>;

export function ProductsPageClient() {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading, isError, error, refetch } = useProducts();
  const {
    data: outlets = [],
    isError: outletsError,
    error: outletsQueryError,
  } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });

  useEffect(() => {
    if (outletsError && outletsQueryError) {
      toast.error(
        outletsQueryError instanceof Error
          ? outletsQueryError.message
          : "Could not load outlets"
      );
    }
  }, [outletsError, outletsQueryError]);
  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "org"],
    queryFn: listCategoriesForOrg,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<InventoryImportRow[] | null>(
    null
  );
  const [importOutletId, setImportOutletId] = useState("");
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<ProductListRow | null>(
    null
  );
  const [adjustOutletId, setAdjustOutletId] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustCost, setAdjustCost] = useState("");
  const [adjustRetail, setAdjustRetail] = useState("");
  const [adjustUnit, setAdjustUnit] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  const defaultOutletId = useMemo(
    () => resolveDefaultOutletId(outlets) ?? "",
    [outlets]
  );

  useEffect(() => {
    if (importOpen && defaultOutletId && !importOutletId) {
      setImportOutletId(defaultOutletId);
    }
  }, [importOpen, defaultOutletId, importOutletId]);

  const form = useForm<AddProductForm>({
    resolver: zodResolver(addProductSchema) as Resolver<AddProductForm>,
    defaultValues: {
      name: "",
      categoryId: "",
      newCategoryName: "",
      unit: "pcs",
      code: "",
      retailPrice: 0,
      costPrice: 0,
      quantity: 0,
      outletId: "",
    },
  });

  const outletIdWatch = form.watch("outletId");

  const createMutation = useMutation({
    mutationFn: async (values: AddProductForm) => {
      const categoryId =
        values.categoryId === "__new__" ? null : values.categoryId || null;
      const categoryName =
        values.categoryId === "__new__"
          ? values.newCategoryName?.trim()
          : undefined;
      return createProduct({
        name: values.name,
        categoryId,
        categoryName,
        unit: values.unit,
        code: values.code?.trim() || undefined,
        retailPrice: values.retailPrice,
        costPrice: values.costPrice,
        quantity: values.quantity,
        outletId: values.outletId,
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Product saved");
        setAddOpen(false);
        form.reset({
          name: "",
          categoryId: "",
          newCategoryName: "",
          unit: "pcs",
          code: "",
          retailPrice: 0,
          costPrice: 0,
          quantity: 0,
          outletId: defaultOutletId,
        });
        void queryClient.invalidateQueries({ queryKey: ["products"] });
        void queryClient.invalidateQueries({ queryKey: ["categories"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importOutletId || !importRows?.length) {
        throw new Error("Choose an outlet and a valid file.");
      }
      setImportProgress("Starting…");
      return importInventoryInChunks(
        importOutletId,
        importRows,
        (done, total) => setImportProgress(`${done} / ${total} rows`)
      );
    },
    onSuccess: (res) => {
      setImportProgress(null);
      if (!res || !Array.isArray(res.errors)) {
        toast.error("Import failed — no response from server. Try again.");
        return;
      }
      const failed = res.errors.length;
      if (failed) {
        toast.warning(
          `Imported ${res.imported} new, updated ${res.updated}. ${failed} row(s) failed.`
        );
      } else {
        toast.success(
          `Done: ${res.imported} new products, ${res.updated} updated.`
        );
      }
      setImportOpen(false);
      setImportRows(null);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    },
    onError: (e) => {
      setImportProgress(null);
      toast.error(e instanceof Error ? e.message : "Import failed");
    },
  });

  const onOpenAdd = useCallback(() => {
    form.reset({
      name: "",
      categoryId: categories[0]?.id ?? "",
      newCategoryName: "",
      unit: "pcs",
      code: "",
      retailPrice: 0,
      costPrice: 0,
      quantity: 0,
      outletId: defaultOutletId,
    });
    setAddOpen(true);
  }, [categories, defaultOutletId, form]);

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustProduct || !adjustOutletId) {
        throw new Error("Choose an outlet.");
      }
      const quantity =
        adjustQty.trim() === "" ? undefined : Number(adjustQty);
      const costPrice =
        adjustCost.trim() === "" ? undefined : Number(adjustCost);
      const retailPrice =
        adjustRetail.trim() === "" ? undefined : Number(adjustRetail);
      const unit = adjustUnit.trim() === "" ? undefined : adjustUnit.trim();
      if (
        quantity === undefined &&
        costPrice === undefined &&
        retailPrice === undefined &&
        unit === undefined
      ) {
        throw new Error("Enter at least one value to update.");
      }
      return adjustProductStock({
        productId: adjustProduct.id,
        outletId: adjustOutletId,
        quantity,
        costPrice,
        retailPrice,
        unit,
      });
    },
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Stock and pricing updated");
        setAdjustOpen(false);
        setAdjustProduct(null);
        void queryClient.invalidateQueries({ queryKey: ["products"] });
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Update failed");
    },
  });

  const openAdjust = useCallback(
    async (row: ProductListRow) => {
      const outletId = defaultOutletId;
      if (!outletId) {
        toast.error("Add an outlet in Settings first.");
        return;
      }
      setAdjustProduct(row);
      setAdjustOutletId(outletId);
      setAdjustUnit(row.unit);
      setAdjustQty("");
      setAdjustCost("");
      setAdjustRetail("");
      setAdjustOpen(true);
      setAdjustLoading(true);
      try {
        const snap = await getProductStockSnapshot(row.id, outletId);
        if (snap) {
          setAdjustQty(String(snap.quantity));
          setAdjustCost(
            snap.costPrice > 0 ? String(snap.costPrice) : ""
          );
          setAdjustRetail(
            snap.retailPrice != null && snap.retailPrice > 0
              ? String(snap.retailPrice)
              : ""
          );
          setAdjustUnit(snap.unit);
        }
      } finally {
        setAdjustLoading(false);
      }
    },
    [defaultOutletId]
  );

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const parsed = parseInventoryWorkbook(buf);
    if (!parsed.ok) {
      toast.error(parsed.error);
      setImportRows(null);
      return;
    }
    setImportRows(parsed.rows);
    toast.success(`Parsed ${parsed.rows.length} row(s). Review and import.`);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Import your stock list (Page, Code, Name, Category, Quantity, Cost,
            Retail Price, Unit, Notes). Blank codes auto-generate; missing cost
            or retail prices are OK — use{" "}
            <strong className="font-medium text-foreground">Adjust</strong> to
            fill them in later.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={downloadInventoryTemplate}
          >
            <Download className="mr-2 size-4" />
            Template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setImportOutletId(defaultOutletId);
              setImportRows(null);
              setImportOpen(true);
            }}
          >
            <FileSpreadsheet className="mr-2 size-4" />
            Import Excel
          </Button>
          <Button type="button" onClick={onOpenAdd}>
            <Plus className="mr-2 size-4" />
            Add product
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catalogue</CardTitle>
          <CardDescription>
            Showing up to 500 products. Larger catalogues will use search and
            pagination in a follow-up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading products…
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Could not load products."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No products yet. Import a spreadsheet or add one manually.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">
                          {r.code ?? "—"}
                        </TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.categoryName}</TableCell>
                        <TableCell>{r.unit}</TableCell>
                        <TableCell>
                          {r.is_active ? "Active" : "Inactive"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openAdjust(r)}
                          >
                            <Pencil className="mr-1 size-3.5" />
                            Adjust
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Leave code empty to auto-generate. Stock is saved for the selected
              outlet (cost + quantity).
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
          >
            <div className="space-y-2">
              <Label htmlFor="outlet">Outlet (stock)</Label>
              <select
                id="outlet"
                aria-label="Outlet for stock"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                {...form.register("outletId")}
              >
                <option value="">Select outlet…</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.outletId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.outletId.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">Category</Label>
              <select
                id="categoryId"
                aria-label="Product category"
                className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                {...form.register("categoryId")}
              >
                <option value="">Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ New category…</option>
              </select>
              {form.watch("categoryId") === "__new__" && (
                <Input
                  placeholder="New category name"
                  {...form.register("newCategoryName")}
                />
              )}
              {form.formState.errors.categoryId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
              {form.formState.errors.newCategoryName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.newCategoryName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" {...form.register("unit")} />
            </div>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="code">Code (optional)</Label>
                  <Input
                    id="code"
                    {...form.register("code")}
                    className="font-mono"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    form.setValue("code", generateProductCode(), {
                      shouldValidate: true,
                    })
                  }
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Retail price (TZS)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  {...form.register("retailPrice", { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Cost (TZS)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  {...form.register("costPrice", { valueAsNumber: true })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Opening quantity (this outlet)</Label>
              <Input
                type="number"
                step="0.001"
                min={0}
                {...form.register("quantity", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || !outletIdWatch}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from Excel</DialogTitle>
            <DialogDescription>
              Same layout as your General Stock list: Page, Code, Name,
              Category, Quantity, Cost, Retail Price, Unit, Notes. Cost and
              retail may be blank; quantities like{" "}
              <code className="text-xs">22+</code> are accepted. Blank code =
              auto-generated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target outlet (stock)</Label>
              {outlets.length === 0 ? (
                <p className="text-sm text-destructive">
                  No outlets loaded — check you are signed in, or add an outlet
                  in Settings.
                </p>
              ) : (
                <select
                  aria-label="Target outlet for import"
                  className="flex h-9 w-full max-w-md rounded-lg border border-input bg-background px-3 text-sm"
                  value={importOutletId}
                  onChange={(e) => setImportOutletId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.is_default ? " (default)" : ""}
                      {!o.is_active ? " — inactive" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="xlsx">Spreadsheet (.xlsx)</Label>
              <Input
                id="xlsx"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {importRows && importRows.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Retail</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importRows.slice(0, 50).map((r, i) => (
                      <TableRow key={`${r.code}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.category}</TableCell>
                        <TableCell>{r.quantity}</TableCell>
                        <TableCell>
                          {r.cost != null ? formatTzs(r.cost) : "—"}
                        </TableCell>
                        <TableCell>
                          {r.retailPrice != null ? formatTzs(r.retailPrice) : "—"}
                        </TableCell>
                        <TableCell>{r.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {importRows.length > 50 && (
                  <p className="border-t p-2 text-muted-foreground">
                    …and {importRows.length - 50} more rows (all will be imported).
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                importMutation.isPending ||
                !importOutletId ||
                !importRows?.length
              }
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {importMutation.isPending && importProgress
                ? importProgress
                : `Import ${importRows?.length ?? 0} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust stock &amp; pricing</DialogTitle>
            <DialogDescription>
              {adjustProduct ? (
                <>
                  <span className="font-medium text-foreground">
                    {adjustProduct.name}
                  </span>
                  {adjustProduct.code ? (
                    <>
                      {" "}
                      (<code className="text-xs">{adjustProduct.code}</code>)
                    </>
                  ) : null}
                  . Leave a field blank to keep its current value.
                </>
              ) : (
                "Update quantity, cost, retail price, or unit for the selected outlet."
              )}
            </DialogDescription>
          </DialogHeader>
          {adjustLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading current stock…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Outlet</Label>
                <select
                  aria-label="Outlet for adjustment"
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={adjustOutletId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setAdjustOutletId(id);
                    if (adjustProduct && id) {
                      setAdjustLoading(true);
                      try {
                        const snap = await getProductStockSnapshot(
                          adjustProduct.id,
                          id
                        );
                        if (snap) {
                          setAdjustQty(String(snap.quantity));
                          setAdjustCost(
                            snap.costPrice > 0 ? String(snap.costPrice) : ""
                          );
                          setAdjustRetail(
                            snap.retailPrice != null && snap.retailPrice > 0
                              ? String(snap.retailPrice)
                              : ""
                          );
                          setAdjustUnit(snap.unit);
                        }
                      } finally {
                        setAdjustLoading(false);
                      }
                    }
                  }}
                >
                  <option value="">Select…</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjust-unit">Unit</Label>
                <Input
                  id="adjust-unit"
                  value={adjustUnit}
                  onChange={(e) => setAdjustUnit(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjust-qty">Quantity</Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min={0}
                  step="0.001"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="adjust-cost">Cost (TZS)</Label>
                  <Input
                    id="adjust-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    value={adjustCost}
                    onChange={(e) => setAdjustCost(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adjust-retail">Retail (TZS)</Label>
                  <Input
                    id="adjust-retail"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Optional"
                    value={adjustRetail}
                    onChange={(e) => setAdjustRetail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdjustOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                adjustMutation.isPending || adjustLoading || !adjustOutletId
              }
              onClick={() => adjustMutation.mutate()}
            >
              {adjustMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
