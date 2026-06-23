"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo } from "react";
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
import {
  createProductApi,
  fetchInventoryCategories,
} from "@/lib/api/inventory-catalog-fetch";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { generateProductCode } from "@/lib/products/sku";

const nonNegNumber = z.preprocess((v) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}, z.number().nonnegative());

const addProductSchema = z
  .object({
    productName: z.string().trim().min(1, "Name is required"),
    categoryId: z.string(),
    newCategoryName: z.string().optional(),
    unit: z.string().trim().min(1, "Unit is required"),
    code: z.string().optional(),
    retailPrice: nonNegNumber,
    costPrice: nonNegNumber,
    quantity: nonNegNumber,
    outletId: z.string().min(1, "Outlet is required"),
  })
  .superRefine((data, ctx) => {
    if (data.categoryId === "__new__") {
      if (!data.newCategoryName?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a name for the new category.",
          path: ["newCategoryName"],
        });
      }
    } else if (!data.categoryId) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a category.",
        path: ["categoryId"],
      });
    }
  });

type AddProductForm = z.infer<typeof addProductSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select outlet (e.g. active outlet from header). */
  preferredOutletId?: string | null;
  onCreated?: () => void;
};

export function AddProductDialog({
  open,
  onOpenChange,
  preferredOutletId,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();

  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", "org"],
    queryFn: fetchInventoryCategories,
    enabled: open,
  });

  const defaultOutletId = useMemo(
    () =>
      preferredOutletId ||
      resolveDefaultOutletId(outlets) ||
      "",
    [preferredOutletId, outlets]
  );

  const form = useForm<AddProductForm>({
    resolver: zodResolver(addProductSchema) as Resolver<AddProductForm>,
    defaultValues: {
      productName: "",
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

  useEffect(() => {
    if (!open) return;
    form.reset({
      productName: "",
      categoryId: categories[0]?.id ?? "",
      newCategoryName: "",
      unit: "pcs",
      code: "",
      retailPrice: 0,
      costPrice: 0,
      quantity: 0,
      outletId: defaultOutletId,
    });
  }, [open, categories, defaultOutletId, form]);

  const createMutation = useMutation({
    mutationFn: async (values: AddProductForm) => {
      const categoryId =
        values.categoryId === "__new__" ? null : values.categoryId || null;
      const categoryName =
        values.categoryId === "__new__"
          ? values.newCategoryName?.trim()
          : undefined;
      return createProductApi({
        name: values.productName.trim(),
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
        onOpenChange(false);
        void queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
        void queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
        void queryClient.invalidateQueries({ queryKey: ["categories"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
        onCreated?.();
      } else {
        toast.error(res.message);
      }
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Save failed");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          onSubmit={form.handleSubmit(
            (v) => createMutation.mutate(v),
            (errors) => {
              const first = Object.values(errors).find((e) => e?.message);
              if (first?.message) toast.error(String(first.message));
            }
          )}
        >
          <div className="space-y-2">
            <Label htmlFor="add-outlet">Outlet (stock)</Label>
            <select
              id="add-outlet"
              aria-label="Outlet for stock"
              className="flex min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
            <Label htmlFor="add-productName">Name</Label>
            <Input id="add-productName" {...form.register("productName")} />
            {form.formState.errors.productName && (
              <p className="text-xs text-destructive">
                {form.formState.errors.productName.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-categoryId">Category</Label>
            <select
              id="add-categoryId"
              aria-label="Product category"
              className="flex min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
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
                Import Excel or add a new category below.
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-unit">Unit</Label>
            <Input id="add-unit" {...form.register("unit")} />
          </div>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="add-code">Code (optional)</Label>
                <Input
                  id="add-code"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Retail price (TZS)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                {...form.register("retailPrice")}
              />
            </div>
            <div className="space-y-2">
              <Label>Cost (TZS)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                {...form.register("costPrice")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Opening quantity (this outlet)</Label>
            <Input
              type="number"
              step="0.001"
              min={0}
              {...form.register("quantity")}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
  );
}
