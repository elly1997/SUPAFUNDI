import "server-only";

import { listProductPriceCatalog } from "@/lib/actions/inventory";
import type { InventoryImportRow } from "@/lib/excel/parse-inventory";
import { stockStatus, type StockStatus } from "@/lib/inventory/stock-status";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchByInChunks } from "@/lib/supabase/query-chunks";

export type CatalogBackupProduct = InventoryImportRow & {
  productId: string;
};

export type CatalogBackupJson = {
  version: 1;
  exportedAt: string;
  organizationId: string;
  outletId: string;
  outletName: string;
  productCount: number;
  products: CatalogBackupProduct[];
};

export async function buildCatalogBackup(
  outletId: string,
  filters?: { status?: StockStatus | "all" | null }
): Promise<CatalogBackupJson> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();

  const { data: outlet } = await supabase
    .from("outlets")
    .select("id, name")
    .eq("id", outletId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  if (!outlet) {
    throw new Error("Invalid outlet for your organization.");
  }

  const catalog = await listProductPriceCatalog(outletId);
  const ids = catalog.map((p) => p.id);

  const stockRows = ids.length
    ? await fetchByInChunks(ids, async (chunk) => {
        const { data, error } = await supabase
          .from("stock")
          .select("product_id, quantity")
          .eq("organization_id", ctx.organizationId)
          .eq("outlet_id", outletId)
          .in("product_id", chunk);
        return { data, error };
      })
    : [];

  const qtyMap = new Map(
    stockRows.map((s) => [s.product_id as string, Number(s.quantity)])
  );

  let products: CatalogBackupProduct[] = catalog.map((p) => ({
    productId: p.id,
    code: p.code?.trim() ?? "",
    name: p.name,
    category: p.categoryName,
    quantity: qtyMap.get(p.id) ?? 0,
    cost: p.costPrice > 0 ? p.costPrice : undefined,
    retailPrice:
      p.retailPrice != null && p.retailPrice > 0 ? p.retailPrice : undefined,
    unit: p.unit,
    notes: "",
  }));

  const status =
    filters?.status && filters.status !== "all" ? filters.status : null;
  if (status) {
    const reorderRows = ids.length
      ? await fetchByInChunks(ids, async (chunk) => {
          const { data, error } = await supabase
            .from("products")
            .select("id, reorder_point")
            .in("id", chunk);
          return { data, error };
        })
      : [];
    const reorderMap = new Map(
      reorderRows.map((r) => [String(r.id), Number(r.reorder_point ?? 0)])
    );
    products = products.filter(
      (p) =>
        stockStatus(p.quantity, reorderMap.get(p.productId) ?? 0) === status
    );
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    organizationId: ctx.organizationId,
    outletId,
    outletName: outlet.name,
    productCount: products.length,
    products,
  };
}
