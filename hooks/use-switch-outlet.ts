"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { updateActiveOutlet } from "@/lib/actions/auth";
import { canSwitchOutlets } from "@/lib/auth/roles";
import { invalidateOutletScopedQueries } from "@/lib/query/invalidate-outlet-queries";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore } from "@/stores/cartStore";

const POS_CART_KEY = "supafundi_pos_cart";

export function useSwitchOutlet() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const session = useAuthStore((s) => s.session);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId);

  const switchOutlet = useCallback(
    (outletId: string) => {
      if (!canSwitchOutlets(session?.role ?? null)) return;
      if (!outletId || outletId === activeOutletId) return;

      const previous = activeOutletId;
      useCartStore.getState().clear();
      try {
        sessionStorage.removeItem(POS_CART_KEY);
      } catch {
        /* ignore */
      }
      setActiveOutletId(outletId);

      startTransition(async () => {
        const res = await updateActiveOutlet(outletId);
        if (!res.ok) {
          setActiveOutletId(previous);
          toast.error(res.message);
          return;
        }
        await invalidateOutletScopedQueries(queryClient);
        router.refresh();
      });
    },
    [
      activeOutletId,
      queryClient,
      router,
      session?.role,
      setActiveOutletId,
    ]
  );

  return { switchOutlet, pending };
}
