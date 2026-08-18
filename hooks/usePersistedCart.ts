"use client";

import { useEffect } from "react";
import { useCartStore, type CartLine } from "@/stores/cartStore";

const KEY = "supafundi_pos_cart";

type Persisted = {
  outletId: string;
  lines: CartLine[];
};

export function usePersistedCart(outletId: string | null) {
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    if (!outletId || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Persisted;
      if (parsed.outletId !== outletId) {
        clear();
        sessionStorage.removeItem(KEY);
        return;
      }
      if (!parsed.lines?.length) return;
      const current = useCartStore.getState().lines;
      if (current.length === 0) {
        useCartStore.setState({ lines: parsed.lines });
      }
    } catch {
      /* ignore */
    }
  }, [outletId, clear]);

  useEffect(() => {
    if (!outletId || typeof window === "undefined") return;
    try {
      if (lines.length === 0) {
        sessionStorage.removeItem(KEY);
      } else {
        const payload: Persisted = { outletId, lines };
        sessionStorage.setItem(KEY, JSON.stringify(payload));
      }
    } catch {
      /* ignore */
    }
  }, [outletId, lines]);

  return { clearPersisted: () => sessionStorage.removeItem(KEY) };
}
