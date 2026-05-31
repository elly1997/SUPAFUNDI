import "server-only";

import { deleteProductsByIds } from "@/lib/inventory/duplicate-products";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getProductOrgStockTotal(
  organizationId: string,
  productId: string
): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("stock")
    .select("quantity")
    .eq("organization_id", organizationId)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + Number(r.quantity), 0);
}

async function hasOpenTransferLines(
  organizationId: string,
  productId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select("id")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "approved", "dispatched"]);
  const transferIds = (transfers ?? []).map((t) => t.id);
  if (transferIds.length === 0) return false;

  const { count } = await supabase
    .from("stock_transfer_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .in("transfer_id", transferIds);
  return (count ?? 0) > 0;
}

export async function deleteProductIfZeroStock(
  organizationId: string,
  productId: string
): Promise<
  | { ok: true; deleted: true }
  | { ok: false; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!product) {
    return { ok: false, message: "Product not found." };
  }

  const totalQty = await getProductOrgStockTotal(organizationId, productId);
  if (totalQty > 0) {
    return {
      ok: false,
      message: `Cannot delete — ${totalQty} units still on hand across outlets.`,
    };
  }

  if (await hasOpenTransferLines(organizationId, productId)) {
    return {
      ok: false,
      message:
        "Cannot delete while this product is on an open stock transfer.",
    };
  }

  const result = await deleteProductsByIds(organizationId, [productId]);
  if (result.deleted === 0) {
    return {
      ok: false,
      message: result.errors[0]?.message ?? "Could not delete product.",
    };
  }

  return { ok: true, deleted: true };
}
