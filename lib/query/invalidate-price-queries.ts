import type { QueryClient } from "@tanstack/react-query";

/** Invalidate client caches that depend on catalog / retail prices. */
export function invalidatePriceDependentQueries(
  queryClient: QueryClient
): void {
  const keys = [
    "product-price-catalog",
    "pos-products",
    "stock-levels",
    "stock-valuation",
    "inventory-analytics",
  ] as const;
  for (const key of keys) {
    void queryClient.invalidateQueries({
      queryKey: [key],
      refetchType: "all",
    });
  }
}
