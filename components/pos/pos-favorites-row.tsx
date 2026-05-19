"use client";

import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTopPosProducts } from "@/lib/actions/pos";
import { useClientMounted } from "@/hooks/useClientMounted";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import type { PosProductRow } from "@/hooks/usePosProducts";

const FAV_KEY = "pos_favorite_products";

function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(productId: string): string[] {
  const current = readFavorites();
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [productId, ...current].slice(0, 24);
  localStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}

type Props = {
  outletId: string;
  products: PosProductRow[];
  onPick: (product: PosProductRow) => void;
};

export function PosFavoritesRow({ outletId, products, onPick }: Props) {
  const mounted = useClientMounted();
  const [favorites, setFavorites] = useState<string[]>([]);

  const { data: top = [] } = useQuery({
    queryKey: ["pos-top-products", outletId],
    queryFn: () => getTopPosProducts(outletId, 8),
    enabled: mounted && !!outletId,
    staleTime: 120_000,
  });

  useEffect(() => {
    if (mounted) setFavorites(readFavorites());
  }, [mounted]);

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const quickPicks = useMemo(() => {
    if (!mounted) return [];
    const ids = new Set<string>();
    const rows: PosProductRow[] = [];
    for (const id of favorites) {
      if (ids.has(id)) continue;
      const p = productMap.get(id);
      if (p) {
        ids.add(id);
        rows.push(p);
      }
    }
    for (const t of top) {
      if (ids.has(t.productId)) continue;
      const p = productMap.get(t.productId);
      if (p) {
        ids.add(t.productId);
        rows.push(p);
      }
    }
    return rows.slice(0, 10);
  }, [mounted, favorites, top, productMap]);

  const handlePick = useCallback(
    (p: PosProductRow) => onPick(p),
    [onPick]
  );

  if (!mounted || quickPicks.length === 0) return null;

  return (
    <div className="border-b px-3 py-2">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Star className="size-3.5 text-warning" />
        Quick picks
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {quickPicks.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => handlePick(p)}
            className={cn(
              "shrink-0 rounded-xl border bg-card px-3 py-2 text-left touch-manipulation",
              "hover:border-primary/40 active:scale-[0.98]"
            )}
          >
            <span className="block max-w-[8rem] truncate text-xs font-semibold">
              {p.name}
            </span>
            <span className="font-money block text-xs font-bold text-primary">
              {p.displayPrice > 0 ? formatTzs(p.displayPrice) : "—"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
