import type { QueryClient } from "@tanstack/react-query";

/** Refetch stock list + summary KPIs after qty, cost, purchases, or sales. */
export async function invalidateStockLevelsQueries(
  queryClient: QueryClient,
  outletId?: string | null
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: ["stock-levels"],
    refetchType: "all",
  });
  if (outletId) {
    await queryClient.refetchQueries({
      queryKey: ["stock-levels", "summary", outletId],
      type: "active",
    });
    await queryClient.refetchQueries({
      queryKey: ["stock-levels", "page", outletId],
      type: "active",
    });
  }
}
