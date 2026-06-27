import type { QueryClient } from "@tanstack/react-query";
import { invalidateStockLevelsQueries } from "@/lib/query/invalidate-stock-queries";

/** Invalidate client caches that depend on catalog / retail prices. */
export function invalidatePriceDependentQueries(
  queryClient: QueryClient,
  outletId?: string | null
): void {
  const keys = [
    "product-price-catalog",
    "pos-products",
    "stock-valuation",
    "inventory-analytics",
  ] as const;
  for (const key of keys) {
    void queryClient.invalidateQueries({
      queryKey: [key],
      refetchType: "all",
    });
  }
  void invalidateStockLevelsQueries(queryClient, outletId);
}
