"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { ProductsClearAllDialog } from "@/components/inventory/products-clear-all-dialog";
import { ProductsDuplicatesDialog } from "@/components/inventory/products-duplicates-dialog";
import { CatalogCategoryFilter } from "@/components/inventory/catalog-category-filter";
import { ProductEditDialog } from "@/components/inventory/product-edit-dialog";
import { ProductsPriceListClient } from "@/components/inventory/products-price-list-client";
import { createProduct, listCategoriesForOrg } from "@/lib/actions/inventory";
import { fetchProductPriceCatalog } from "@/lib/api/inventory-catalog-fetch";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { generateProductCode } from "@/lib/products/sku";
import { useAuthStore } from "@/stores/authStore";

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
  const role = useAuthStore((s) => s.session?.role ?? null);
  const outletId = useAuthStore((s) => s.activeOutletId);
  const canManage = canManageSettings(isUserRole(role ?? "") ? role : null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["product-price-catalog", outletId],
    queryFn: () => fetchProductPriceCatalog(outletId),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "org"],
    queryFn: listCategoriesForOrg,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);

  const defaultOutletId = useMemo(
    () => resolveDefaultOutletId(outlets) ?? "",
    [outlets]
  );

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
        void queryClient.invalidateQueries({
          queryKey: ["product-price-catalog"],
        });
        void queryClient.invalidateQueries({ queryKey: ["categories"] });
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
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

  const categoryOptions = useMemo(
    () => Array.from(new Set(catalog.map((r) => r.categoryName))).sort(),
    [catalog]
  );

  const invalidateCatalog = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Price list for codes and selling prices. Import stock from Excel on
            the{" "}
            <strong className="font-medium text-foreground">Stock</strong> page.
            Quantities and valuation are managed there too.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["product-price-catalog"],
              })
            }
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
          {canManage && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDuplicatesOpen(true)}
              >
                <Copy className="mr-2 size-4" />
                Remove duplicates
              </Button>
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setClearAllOpen(true)}
              >
                <Trash2 className="mr-2 size-4" />
                Clear all items
              </Button>
            </>
          )}
          <Button type="button" onClick={onOpenAdd}>
            <Plus className="mr-2 size-4" />
            Add product
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search name, code, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <CatalogCategoryFilter
          categories={categoryOptions}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
      </div>

      <ProductsPriceListClient
        search={search}
        categoryFilter={categoryFilter}
        canManage={canManage}
        onClearAll={canManage ? () => setClearAllOpen(true) : undefined}
        onEditProduct={(id) => setEditProductId(id)}
      />

      <ProductEditDialog
        productId={editProductId}
        open={!!editProductId}
        onOpenChange={(o) => !o && setEditProductId(null)}
      />

      <ProductsDuplicatesDialog
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
      />

      <ProductsClearAllDialog
        open={clearAllOpen}
        onOpenChange={setClearAllOpen}
        productCount={catalog.length}
        onCleared={invalidateCatalog}
      />

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
              {categories.length === 0 && (
                <p className="form-hint">
                  Categories appear here after Excel import (Stock page) or when you
                  add a new one below.
                </p>
              )}
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
    </div>
  );
}
