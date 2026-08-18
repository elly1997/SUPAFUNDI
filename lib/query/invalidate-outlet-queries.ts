import type { QueryClient } from "@tanstack/react-query";

/** Refetch branch-scoped screens after the active outlet changes. */
export async function invalidateOutletScopedQueries(
  queryClient: QueryClient
): Promise<void> {
  await queryClient.invalidateQueries({ refetchType: "active" });
}
