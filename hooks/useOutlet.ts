"use client";

import { useAuthStore } from "@/stores/authStore";

/** Active outlet for POS and stock operations (profile + local override). */
export function useOutlet() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const session = useAuthStore((s) => s.session);
  return {
    outletId: outletId ?? session?.outletId ?? null,
    organizationId: session?.organizationId ?? null,
  };
}
