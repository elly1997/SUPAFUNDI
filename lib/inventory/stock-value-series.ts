import { endOfDay, format, parseISO, eachDayOfInterval } from "date-fns";
import { roundMoney } from "@/lib/utils/calculations";

const IN_MOVEMENTS = new Set([
  "purchase",
  "transfer_in",
  "adjustment_in",
  "return_in",
  "opening",
]);
const OUT_MOVEMENTS = new Set([
  "sale",
  "transfer_out",
  "adjustment_out",
  "return_out",
]);

export function movementDelta(type: string, qty: number): number {
  if (IN_MOVEMENTS.has(type)) return qty;
  if (OUT_MOVEMENTS.has(type)) return -qty;
  return 0;
}

export type StockMovementRow = {
  product_id: string | null;
  movement_type: string;
  quantity: number;
  unit_cost: number | null;
  reference_type: string | null;
  notes: string | null;
  created_at: string;
};

export type StockValuePoint = {
  date: string;
  value: number;
  retailValue: number;
};

export type CatalogValuationRow = {
  id: string;
  costPrice: number;
  retailPrice: number | null;
  stockQty: number;
};

export type StockSnapshot = {
  costValue: number;
  retailValue: number;
  skusWithQty: number;
};

/** Same valuation basis as Stock & prices (qty × cost/retail from live stock). */
export function computeStockSnapshot(
  catalog: CatalogValuationRow[]
): StockSnapshot {
  let costValue = 0;
  let retailValue = 0;
  let skusWithQty = 0;
  for (const row of catalog) {
    const qty = row.stockQty;
    if (qty <= 0) continue;
    skusWithQty += 1;
    costValue += qty * row.costPrice;
    retailValue += qty * (row.retailPrice ?? 0);
  }
  return {
    costValue: roundMoney(costValue),
    retailValue: roundMoney(retailValue),
    skusWithQty,
  };
}

type TimedCost = { at: number; value: number };

function isRetailPriceMovement(m: StockMovementRow): boolean {
  const note = (m.notes ?? "").toLowerCase();
  return note.includes("retail");
}

function buildCostTimelines(
  movements: StockMovementRow[],
  defaultCosts: Map<string, number>
): Map<string, TimedCost[]> {
  const timelines = new Map<string, TimedCost[]>();
  for (const id of Array.from(defaultCosts.keys())) {
    timelines.set(id, []);
  }

  for (const m of movements) {
    if (!m.product_id || m.unit_cost == null) continue;
    const cost = Number(m.unit_cost);
    if (!Number.isFinite(cost) || cost < 0) continue;
    if (isRetailPriceMovement(m)) continue;

    const at = new Date(m.created_at).getTime();
    const hasQty = Number(m.quantity) > 0;
    const isPurchase = m.movement_type === "purchase" || m.movement_type === "opening";
    const isCostPatch =
      m.reference_type === "price_adjustment" && Number(m.quantity) === 0;

    if (!hasQty && !isPurchase && !isCostPatch) continue;

    const list = timelines.get(m.product_id) ?? [];
    list.push({ at, value: cost });
    timelines.set(m.product_id, list);
  }

  for (const [, list] of Array.from(timelines.entries())) {
    list.sort((a, b) => a.at - b.at);
  }
  return timelines;
}

function buildRetailTimelines(
  movements: StockMovementRow[],
  defaultRetail: Map<string, number>
): Map<string, TimedCost[]> {
  const timelines = new Map<string, TimedCost[]>();
  for (const id of Array.from(defaultRetail.keys())) {
    timelines.set(id, []);
  }

  for (const m of movements) {
    if (!m.product_id || m.unit_cost == null) continue;
    if (!isRetailPriceMovement(m)) continue;
    const retail = Number(m.unit_cost);
    if (!Number.isFinite(retail) || retail < 0) continue;
    const list = timelines.get(m.product_id) ?? [];
    list.push({ at: new Date(m.created_at).getTime(), value: retail });
    timelines.set(m.product_id, list);
  }

  for (const [, list] of Array.from(timelines.entries())) {
    list.sort((a, b) => a.at - b.at);
  }
  return timelines;
}

function valueAtTime(timeline: TimedCost[] | undefined, atMs: number, fallback: number) {
  if (!timeline?.length) return fallback;
  let value = fallback;
  for (const point of timeline) {
    if (point.at <= atMs) value = point.value;
    else break;
  }
  return value;
}

/**
 * Rebuild daily stock value from movements, anchored to live `stock` quantities.
 * Import / manual stock without movement rows still reconciles correctly.
 */
export function buildStockValueSeries(input: {
  from: string;
  to: string;
  productIds: string[];
  qtyNow: Map<string, number>;
  defaultCosts: Map<string, number>;
  defaultRetail: Map<string, number>;
  movements: StockMovementRow[];
}): StockValuePoint[] {
  const { from, to, productIds, qtyNow, defaultCosts, defaultRetail, movements } =
    input;
  if (!productIds.length) return [];

  const totalNetThroughEnd = new Map<string, number>();
  for (const id of productIds) totalNetThroughEnd.set(id, 0);
  for (const m of movements) {
    if (!m.product_id) continue;
    const prev = totalNetThroughEnd.get(m.product_id) ?? 0;
    totalNetThroughEnd.set(
      m.product_id,
      prev + movementDelta(m.movement_type, Number(m.quantity))
    );
  }

  const baselineQty = new Map<string, number>();
  for (const id of productIds) {
    const now = qtyNow.get(id) ?? 0;
    const net = totalNetThroughEnd.get(id) ?? 0;
    baselineQty.set(id, now - net);
  }

  const fromMs = parseISO(from).getTime();
  const openingQty = new Map<string, number>();
  for (const id of productIds) {
    let netBeforeFrom = 0;
    for (const m of movements) {
      if (m.product_id !== id) continue;
      if (new Date(m.created_at).getTime() < fromMs) {
        netBeforeFrom += movementDelta(m.movement_type, Number(m.quantity));
      }
    }
    openingQty.set(id, Math.max(0, (baselineQty.get(id) ?? 0) + netBeforeFrom));
  }

  const costTimelines = buildCostTimelines(movements, defaultCosts);
  const retailTimelines = buildRetailTimelines(movements, defaultRetail);

  const dayEnds = eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((d) => endOfDay(d));

  const runningQty = new Map(openingQty);
  let moveIdx = 0;

  return dayEnds.map((dayEnd) => {
    const endMs = dayEnd.getTime();
    while (moveIdx < movements.length) {
      const m = movements[moveIdx];
      const at = new Date(m.created_at).getTime();
      if (at > endMs) break;
      if (m.product_id) {
        const prev = runningQty.get(m.product_id) ?? 0;
        runningQty.set(
          m.product_id,
          Math.max(0, prev + movementDelta(m.movement_type, Number(m.quantity)))
        );
      }
      moveIdx += 1;
    }

    let value = 0;
    let retailValue = 0;
    for (const id of productIds) {
      const qty = runningQty.get(id) ?? 0;
      if (qty <= 0) continue;
      const cost = valueAtTime(
        costTimelines.get(id),
        endMs,
        defaultCosts.get(id) ?? 0
      );
      const retail = valueAtTime(
        retailTimelines.get(id),
        endMs,
        defaultRetail.get(id) ?? 0
      );
      value += qty * cost;
      retailValue += qty * retail;
    }

    return {
      date: format(dayEnd, "yyyy-MM-dd"),
      value: roundMoney(value),
      retailValue: roundMoney(retailValue),
    };
  });
}
