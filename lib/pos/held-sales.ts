import type { CartLine } from "@/stores/cartStore";
import type { PosPricingMode } from "@/hooks/usePosProducts";

export type HeldSale = {
  id: string;
  outletId: string;
  label: string;
  lines: CartLine[];
  pricingMode: PosPricingMode;
  customerId: string;
  customerName: string | null;
  chargeTotal: string;
  heldAt: string;
};

const KEY = "supafundi_pos_held_sales_v1";
const MAX_HELD = 5;

function readAll(): HeldSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HeldSale[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(rows: HeldSale[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_HELD * 4)));
  } catch {
    /* ignore quota */
  }
}

export function listHeldSales(outletId: string): HeldSale[] {
  return readAll()
    .filter((h) => h.outletId === outletId)
    .sort((a, b) => (a.heldAt < b.heldAt ? 1 : -1))
    .slice(0, MAX_HELD);
}

export function holdCurrentSale(input: Omit<HeldSale, "id" | "heldAt">): HeldSale {
  const row: HeldSale = {
    ...input,
    id: `hold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    heldAt: new Date().toISOString(),
  };
  const others = readAll().filter(
    (h) => !(h.outletId === input.outletId && h.id === row.id)
  );
  const forOutlet = others.filter((h) => h.outletId === input.outletId);
  const trimmedOutlet = [row, ...forOutlet].slice(0, MAX_HELD);
  const otherOutlets = others.filter((h) => h.outletId !== input.outletId);
  writeAll([...trimmedOutlet, ...otherOutlets]);
  return row;
}

export function removeHeldSale(id: string) {
  writeAll(readAll().filter((h) => h.id !== id));
}

export function getHeldSale(id: string): HeldSale | null {
  return readAll().find((h) => h.id === id) ?? null;
}
