"use server";

import { endOfDay, format, parseISO, eachDayOfInterval } from "date-fns";
import {
  resolveInventoryReportRange,
  type InventoryReportPreset,
} from "@/lib/inventory/report-range";
import { listProductPriceCatalog } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";
import {
  buildInventorySeasonalInsights,
  type CategorySeasonalTrend,
  type SeasonalAnalysis,
  type SeasonalInsight,
} from "@/lib/analytics/seasonal-insights";
import {
  computeCategorySeasonalTrends,
  computeSalesSeasonalAnalysis,
} from "@/lib/actions/seasonal-analytics";

export type { InventoryReportPreset } from "@/lib/inventory/report-range";

export type StockValuePoint = {
  date: string;
  value: number;
  retailValue: number;
};

export type CategoryMetricRow = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  quantitySold: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Lower = faster turnover (sells through stock quicker). */
  avgDaysOnShelf: number | null;
  turnoverRate: number;
};

export type FastMovingProductRow = {
  productId: string;
  productName: string;
  categoryName: string;
  quantitySold: number;
  revenue: number;
  margin: number;
  daysOnShelf: number | null;
};

export type PurchaseAllocationHint = {
  categoryName: string;
  priority: "high" | "medium" | "low";
  message: string;
};

export type InventoryAnalyticsReport = {
  preset: InventoryReportPreset;
  from: string;
  to: string;
  outletId: string | null;
  stockValueSeries: StockValuePoint[];
  openingStockValue: number;
  closingStockValue: number;
  stockValueChangePct: number;
  categoriesBySales: CategoryMetricRow[];
  categoriesByMargin: CategoryMetricRow[];
  categoriesByVelocity: CategoryMetricRow[];
  fastMovingProducts: FastMovingProductRow[];
  purchaseHints: PurchaseAllocationHint[];
  lowStockCount: number;
  seasonal: SeasonalAnalysis;
  categorySeasonalTrends: CategorySeasonalTrend[];
  seasonalInsights: SeasonalInsight[];
};

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

function movementDelta(type: string, qty: number): number {
  if (IN_MOVEMENTS.has(type)) return qty;
  if (OUT_MOVEMENTS.has(type)) return -qty;
  return 0;
}

/** Inventory analytics from POS sales, stock levels, and stock movements. */
export async function getInventoryAnalyticsReport(
  preset: InventoryReportPreset,
  outletId?: string | null
): Promise<InventoryAnalyticsReport> {
  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const filterOutlet = outletId ?? ctx.outletId;
  const { from, to } = resolveInventoryReportRange(preset);
  const empty: InventoryAnalyticsReport = {
    preset,
    from,
    to,
    outletId: filterOutlet,
    stockValueSeries: [],
    openingStockValue: 0,
    closingStockValue: 0,
    stockValueChangePct: 0,
    categoriesBySales: [],
    categoriesByMargin: [],
    categoriesByVelocity: [],
    fastMovingProducts: [],
    purchaseHints: [],
    lowStockCount: 0,
    seasonal: {
      hasEnoughData: false,
      lookbackDays: 0,
      overallAvgDaily: 0,
      weekdayPattern: [],
      strongestWeekday: null,
      quietestWeekday: null,
      weekendVsWeekdayPct: null,
      monthPartPattern: [],
      calendarMonthPattern: [],
      strongestMonth: null,
      quietestMonth: null,
      insights: [],
    },
    categorySeasonalTrends: [],
    seasonalInsights: [],
  };

  if (!filterOutlet) return empty;

  const catalog = await listProductPriceCatalog(filterOutlet);
  const productIds = catalog.map((p) => p.id);
  if (!productIds.length) return empty;

  const costByProduct = new Map(catalog.map((p) => [p.id, p.costPrice]));
  const retailByProduct = new Map(catalog.map((p) => [p.id, p.retailPrice]));

  const [stockRows, reorderRows] = await Promise.all([
    fetchByInChunks(productIds, async (chunk) => {
      const { data, error } = await supabase
        .from("stock")
        .select("product_id, quantity")
        .eq("organization_id", ctx.organizationId)
        .eq("outlet_id", filterOutlet)
        .in("product_id", chunk);
      return { data, error };
    }),
    fetchByInChunks(productIds, async (chunk) => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category_id, reorder_point")
        .in("id", chunk);
      return { data, error };
    }),
  ]);

  const qtyNow = new Map<string, number>();
  for (const s of stockRows) {
    qtyNow.set(s.product_id, Number(s.quantity));
  }

  const fromIso = `${from}T00:00:00.000Z`;
  const toEndIso = `${to}T23:59:59.999Z`;

  /** All movements through period end — needed to open the period with correct qty. */
  const movements = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("product_id, movement_type, quantity, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", filterOutlet)
      .lte("created_at", toEndIso)
      .order("created_at", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  const fromMs = parseISO(from).getTime();

  const openingQty = new Map<string, number>();
  for (const id of productIds) openingQty.set(id, 0);
  for (const m of movements) {
    if (!m.product_id) continue;
    if (new Date(m.created_at).getTime() < fromMs) {
      const prev = openingQty.get(m.product_id) ?? 0;
      openingQty.set(
        m.product_id,
        Math.max(0, prev + movementDelta(m.movement_type, Number(m.quantity)))
      );
    }
  }

  const dayEnds = eachDayOfInterval({
    start: parseISO(from),
    end: parseISO(to),
  }).map((d) => endOfDay(d));

  const runningQty = new Map(openingQty);
  let moveIdx = 0;
  const stockValueSeries: StockValuePoint[] = dayEnds.map((dayEnd) => {
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
      value += qty * (costByProduct.get(id) ?? 0);
      retailValue += qty * (retailByProduct.get(id) ?? 0);
    }
    return {
      date: format(dayEnd, "yyyy-MM-dd"),
      value: roundMoney(value),
      retailValue: roundMoney(retailValue),
    };
  });

  const openingStockValue = stockValueSeries[0]?.value ?? 0;
  const closingStockValue =
    stockValueSeries[stockValueSeries.length - 1]?.value ?? 0;
  const stockValueChangePct =
    openingStockValue > 0
      ? roundMoney(
          ((closingStockValue - openingStockValue) / openingStockValue) * 100
        )
      : closingStockValue > 0
        ? 100
        : 0;

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", ctx.organizationId);
  const categoryName = new Map(
    (categories ?? []).map((c) => [c.id, c.name])
  );

  const productMeta = new Map(
    reorderRows.map((p) => [
      p.id,
      {
        name: p.name,
        categoryId: p.category_id as string | null,
        reorder: Number(p.reorder_point ?? 0),
      },
    ])
  );

  const salesInRange = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_date")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", filterOutlet)
      .eq("status", "completed")
      .gte("sale_date", fromIso)
      .lte("sale_date", `${to}T23:59:59.999Z`)
      .order("sale_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  const saleIds = salesInRange.map((s) => s.id);
  const daysInPeriod = Math.max(
    1,
    Math.ceil(
      (parseISO(to).getTime() - parseISO(from).getTime()) / 86400000
    ) + 1
  );

  type ProdAgg = {
    revenue: number;
    qty: number;
    cost: number;
  };
  const byProduct = new Map<string, ProdAgg>();

  if (saleIds.length > 0) {
    const [items, saleMovements] = await Promise.all([
      fetchByInChunks(saleIds, async (chunk) => {
        const { data, error } = await supabase
          .from("sale_items")
          .select("product_id, quantity, total_price")
          .in("sale_id", chunk);
        return { data, error };
      }),
      fetchAllPaginated(async (fromIdx, toIdx) => {
        const { data, error } = await supabase
          .from("stock_movements")
          .select("product_id, quantity, unit_cost")
          .eq("organization_id", ctx.organizationId)
          .eq("outlet_id", filterOutlet)
          .eq("movement_type", "sale")
          .gte("created_at", fromIso)
          .lte("created_at", `${to}T23:59:59.999Z`)
          .range(fromIdx, toIdx);
        return { data, error };
      }),
    ]);

    for (const row of items) {
      if (!row.product_id) continue;
      const prev = byProduct.get(row.product_id) ?? {
        revenue: 0,
        qty: 0,
        cost: 0,
      };
      byProduct.set(row.product_id, {
        revenue: prev.revenue + Number(row.total_price),
        qty: prev.qty + Number(row.quantity),
        cost: prev.cost,
      });
    }

    for (const m of saleMovements) {
      if (!m.product_id) continue;
      const prev = byProduct.get(m.product_id) ?? {
        revenue: 0,
        qty: 0,
        cost: 0,
      };
      const lineCost = Number(m.quantity) * Number(m.unit_cost ?? 0);
      byProduct.set(m.product_id, {
        ...prev,
        cost: prev.cost + lineCost,
      });
    }

    for (const [pid, agg] of Array.from(byProduct.entries())) {
      if (agg.cost === 0 && agg.qty > 0) {
        agg.cost = agg.qty * (costByProduct.get(pid) ?? 0);
      }
    }
  }

  type CatAgg = {
    revenue: number;
    qty: number;
    cost: number;
    daysOnShelfSum: number;
    daysOnShelfWeight: number;
    turnoverSum: number;
  };
  const byCategory = new Map<string, CatAgg>();

  function catKey(categoryId: string | null) {
    return categoryId ?? "__general__";
  }

  function catLabel(categoryId: string | null) {
    if (!categoryId) return "General";
    return categoryName.get(categoryId) ?? "General";
  }

  for (const [productId, agg] of Array.from(byProduct.entries())) {
    const meta = productMeta.get(productId);
    const key = catKey(meta?.categoryId ?? null);
    const prev = byCategory.get(key) ?? {
      revenue: 0,
      qty: 0,
      cost: 0,
      daysOnShelfSum: 0,
      daysOnShelfWeight: 0,
      turnoverSum: 0,
    };
    const currentQty = qtyNow.get(productId) ?? 0;
    const dailySales = agg.qty / daysInPeriod;
    const daysOnShelf =
      dailySales > 0 ? Math.round((currentQty / dailySales) * 10) / 10 : null;
    const turnover =
      currentQty > 0 ? roundMoney(agg.qty / currentQty) : agg.qty > 0 ? 99 : 0;

    byCategory.set(key, {
      revenue: prev.revenue + agg.revenue,
      qty: prev.qty + agg.qty,
      cost: prev.cost + agg.cost,
      daysOnShelfSum:
        prev.daysOnShelfSum +
        (daysOnShelf != null ? daysOnShelf * agg.revenue : 0),
      daysOnShelfWeight:
        prev.daysOnShelfWeight + (daysOnShelf != null ? agg.revenue : 0),
      turnoverSum: prev.turnoverSum + turnover,
    });
  }

  const categoriesBySales: CategoryMetricRow[] = [];
  for (const [key, agg] of Array.from(byCategory.entries())) {
    const categoryId = key === "__general__" ? null : key;
    const margin = roundMoney(agg.revenue - agg.cost);
    const marginPct =
      agg.revenue > 0 ? roundMoney((margin / agg.revenue) * 100) : 0;
    const avgDaysOnShelf =
      agg.daysOnShelfWeight > 0
        ? roundMoney(agg.daysOnShelfSum / agg.daysOnShelfWeight)
        : null;
    categoriesBySales.push({
      categoryId,
      categoryName: catLabel(categoryId),
      revenue: roundMoney(agg.revenue),
      quantitySold: roundMoney(agg.qty),
      cost: roundMoney(agg.cost),
      margin,
      marginPct,
      avgDaysOnShelf,
      turnoverRate: roundMoney(agg.turnoverSum),
    });
  }

  const categoriesByMargin = [...categoriesBySales].sort(
    (a, b) => b.marginPct - a.marginPct
  );
  const categoriesByVelocity = [...categoriesBySales].sort((a, b) => {
    const da = a.avgDaysOnShelf ?? 9999;
    const db = b.avgDaysOnShelf ?? 9999;
    return da - db;
  });
  categoriesBySales.sort((a, b) => b.revenue - a.revenue);

  const fastMovingProducts: FastMovingProductRow[] = Array.from(byProduct.entries())
    .map(([productId, agg]) => {
      const meta = productMeta.get(productId);
      const currentQty = qtyNow.get(productId) ?? 0;
      const dailySales = agg.qty / daysInPeriod;
      const daysOnShelf =
        dailySales > 0
          ? Math.round((currentQty / dailySales) * 10) / 10
          : null;
      return {
        productId,
        productName: meta?.name ?? "Unknown",
        categoryName: catLabel(meta?.categoryId ?? null),
        quantitySold: roundMoney(agg.qty),
        revenue: roundMoney(agg.revenue),
        margin: roundMoney(agg.revenue - agg.cost),
        daysOnShelf,
      };
    })
    .filter((p) => p.quantitySold > 0)
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, 12);

  let lowStockCount = 0;
  for (const p of reorderRows) {
    const qty = qtyNow.get(p.id) ?? 0;
    const reorder = Number(p.reorder_point ?? 0);
    if (reorder > 0 && qty <= reorder) lowStockCount += 1;
  }

  const purchaseHints = buildPurchaseHints(
    categoriesBySales,
    categoriesByVelocity,
    fastMovingProducts,
    lowStockCount
  );

  const [seasonal, categorySeasonalTrends] = await Promise.all([
    computeSalesSeasonalAnalysis(
      ctx.organizationId,
      to,
      filterOutlet,
      false
    ),
    computeCategorySeasonalTrends(ctx.organizationId, filterOutlet, to),
  ]);

  const seasonalInsights = buildInventorySeasonalInsights(
    seasonal,
    categorySeasonalTrends,
    stockValueChangePct
  );

  return {
    preset,
    from,
    to,
    outletId: filterOutlet,
    stockValueSeries,
    openingStockValue,
    closingStockValue,
    stockValueChangePct,
    categoriesBySales: categoriesBySales.slice(0, 10),
    categoriesByMargin: categoriesByMargin.slice(0, 10),
    categoriesByVelocity: categoriesByVelocity.slice(0, 10),
    fastMovingProducts,
    purchaseHints,
    lowStockCount,
    seasonal,
    categorySeasonalTrends,
    seasonalInsights,
  };
}

function buildPurchaseHints(
  bySales: CategoryMetricRow[],
  byVelocity: CategoryMetricRow[],
  fast: FastMovingProductRow[],
  lowStockCount: number
): PurchaseAllocationHint[] {
  const hints: PurchaseAllocationHint[] = [];

  if (lowStockCount > 0) {
    hints.push({
      categoryName: "All",
      priority: "high",
      message: `${lowStockCount} SKU(s) at or below reorder — prioritise replenishment before slow movers.`,
    });
  }

  const top = bySales[0];
  if (top && top.revenue > 0) {
    hints.push({
      categoryName: top.categoryName,
      priority: "high",
      message: `Highest sales (${top.categoryName}) — keep 2–4 weeks cover; increase PO lines when days on shelf fall below 21.`,
    });
  }

  const fastCat = byVelocity.find(
    (c) => c.avgDaysOnShelf != null && c.avgDaysOnShelf <= 14
  );
  if (fastCat) {
    hints.push({
      categoryName: fastCat.categoryName,
      priority: "high",
      message: `${fastCat.categoryName} turns quickly (~${fastCat.avgDaysOnShelf} days on shelf) — allocate more purchase budget here.`,
    });
  }

  const slow = byVelocity.filter(
    (c) => c.avgDaysOnShelf != null && c.avgDaysOnShelf >= 60
  );
  if (slow[0]) {
    hints.push({
      categoryName: slow[0].categoryName,
      priority: "low",
      message: `${slow[0].categoryName} is slow-moving — reduce reorder quantities and avoid over-stocking.`,
    });
  }

  const highMargin = [...bySales]
    .filter((c) => c.marginPct >= 25 && c.revenue > 0)
    .sort((a, b) => b.margin - a.margin)[0];
  if (highMargin) {
    hints.push({
      categoryName: highMargin.categoryName,
      priority: "medium",
      message: `${highMargin.categoryName} has strong margin (${highMargin.marginPct}%) — protect availability without deep discounting.`,
    });
  }

  if (fast[0]) {
    hints.push({
      categoryName: fast[0].categoryName,
      priority: "high",
      message: `Fast SKU: ${fast[0].productName} (${fast[0].quantitySold} units sold) — review shelf quantity weekly.`,
    });
  }

  return hints.slice(0, 6);
}
