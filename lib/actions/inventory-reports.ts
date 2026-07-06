"use server";

import { parseISO } from "date-fns";
import {
  resolveInventoryReportRange,
  type InventoryReportPreset,
} from "@/lib/inventory/report-range";
import {
  buildStockValueSeries,
  computeStockSnapshot,
  type StockValuePoint,
} from "@/lib/inventory/stock-value-series";
import {
  buildCostRetailMarginAnalysis,
  type CostRetailMarginAnalysis,
} from "@/lib/inventory/cost-retail-insights";
import { listProductPriceCatalog } from "@/lib/actions/inventory";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { resolveCategoryName } from "@/lib/products/catalog-grouping";
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

export type { StockValuePoint } from "@/lib/inventory/stock-value-series";

export type { CategoryMetricRow } from "@/lib/inventory/category-metrics";
export type { CostRetailMarginAnalysis } from "@/lib/inventory/cost-retail-insights";
export type { InventoryDecisionInsight } from "@/lib/inventory/inventory-decision-insights";

import {
  buildCategoryBuckets,
  buildCategoryMetricRows,
  finalizeProductCogs,
  saleMovementLineCost,
  sortCategoriesByMarginContribution,
  sortCategoriesBySales,
  sortCategoriesByVelocity,
  type CategoryMetricRow,
} from "@/lib/inventory/category-metrics";
import {
  buildInventoryDecisionInsights,
  type InventoryDecisionInsight,
} from "@/lib/inventory/inventory-decision-insights";

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
  openingRetailStockValue: number;
  closingRetailStockValue: number;
  stockBuildUpCost: number;
  stockBuildUpRetail: number;
  potentialMargin: number;
  skusWithQty: number;
  stockValueChangePct: number;
  retailStockValueChangePct: number;
  costRetailMargin: CostRetailMarginAnalysis;
  categoriesBySales: CategoryMetricRow[];
  categoriesByMargin: CategoryMetricRow[];
  categoriesByVelocity: CategoryMetricRow[];
  fastMovingProducts: FastMovingProductRow[];
  purchaseHints: PurchaseAllocationHint[];
  lowStockCount: number;
  inventoryInsights: InventoryDecisionInsight[];
  seasonal: SeasonalAnalysis;
  categorySeasonalTrends: CategorySeasonalTrend[];
  seasonalInsights: SeasonalInsight[];
};

/** Inventory analytics from live stock, POS sales, and stock movements. */
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
    openingRetailStockValue: 0,
    closingRetailStockValue: 0,
    stockBuildUpCost: 0,
    stockBuildUpRetail: 0,
    potentialMargin: 0,
    skusWithQty: 0,
    stockValueChangePct: 0,
    retailStockValueChangePct: 0,
    costRetailMargin: {
      openingMarginPct: 0,
      closingMarginPct: 0,
      marginPctChange: 0,
      costValueChangePct: 0,
      retailValueChangePct: 0,
      costOutpacingRetail: false,
      skusCostRaisedWithoutRetail: 0,
      insights: [],
    },
    categoriesBySales: [],
    categoriesByMargin: [],
    categoriesByVelocity: [],
    fastMovingProducts: [],
    purchaseHints: [],
    lowStockCount: 0,
    inventoryInsights: [],
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
  const retailByProduct = new Map(
    catalog.map((p) => [p.id, p.retailPrice ?? 0])
  );

  const snapshot = computeStockSnapshot(
    catalog.map((p) => ({
      id: p.id,
      costPrice: p.costPrice,
      retailPrice: p.retailPrice,
      stockQty: p.stockQty,
    }))
  );

  const reorderRows = await fetchByInChunks(productIds, async (chunk) => {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, category_id, reorder_point")
      .in("id", chunk);
    return { data, error };
  });

  const qtyNow = new Map(catalog.map((p) => [p.id, p.stockQty]));

  const fromIso = `${from}T00:00:00.000Z`;
  const toEndIso = `${to}T23:59:59.999Z`;

  /** All movements through period end — reconciled against live stock quantities. */
  const movements = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "product_id, movement_type, quantity, unit_cost, reference_type, notes, created_at"
      )
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", filterOutlet)
      .lte("created_at", toEndIso)
      .order("created_at", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  const stockValueSeries = buildStockValueSeries({
    from,
    to,
    productIds,
    qtyNow,
    defaultCosts: costByProduct,
    defaultRetail: retailByProduct,
    movements,
  });

  if (stockValueSeries.length > 0) {
    const last = stockValueSeries[stockValueSeries.length - 1]!;
    last.value = snapshot.costValue;
    last.retailValue = snapshot.retailValue;
  }

  const openingStockValue = stockValueSeries[0]?.value ?? 0;
  const openingRetailStockValue = stockValueSeries[0]?.retailValue ?? 0;
  const closingStockValue = snapshot.costValue;
  const closingRetailStockValue = snapshot.retailValue;
  const stockBuildUpCost = roundMoney(closingStockValue - openingStockValue);
  const stockBuildUpRetail = roundMoney(
    closingRetailStockValue - openingRetailStockValue
  );
  const potentialMargin = roundMoney(
    closingRetailStockValue - closingStockValue
  );

  const stockValueChangePct =
    openingStockValue > 0
      ? roundMoney(
          ((closingStockValue - openingStockValue) / openingStockValue) * 100
        )
      : closingStockValue > 0
        ? 100
        : 0;
  const retailStockValueChangePct =
    openingRetailStockValue > 0
      ? roundMoney(
          ((closingRetailStockValue - openingRetailStockValue) /
            openingRetailStockValue) *
            100
        )
      : closingRetailStockValue > 0
        ? 100
        : 0;

  const productNames = new Map(
    reorderRows.map((p) => [p.id, p.name as string])
  );
  const costRetailMargin = buildCostRetailMarginAnalysis({
    openingCostValue: openingStockValue,
    closingCostValue: closingStockValue,
    openingRetailValue: openingRetailStockValue,
    closingRetailValue: closingRetailStockValue,
    costValueChangePct: stockValueChangePct,
    retailValueChangePct: retailStockValueChangePct,
    movements,
    fromMs: parseISO(from).getTime(),
    toMs: parseISO(`${to}T23:59:59.999Z`).getTime(),
    productNames,
  });

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
  const productCategoryId = new Map(
    reorderRows.map((p) => [p.id, p.category_id as string | null])
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
      const lineCost = saleMovementLineCost(
        Number(m.quantity),
        m.unit_cost != null ? Number(m.unit_cost) : null
      );
      byProduct.set(m.product_id, {
        ...prev,
        cost: prev.cost + lineCost,
      });
    }

    finalizeProductCogs(byProduct, costByProduct);
  }

  const categoryBuckets = buildCategoryBuckets({
    productIds,
    byProduct,
    productCategoryId,
    categoryNameById: categoryName,
    qtyNow,
    costByProduct,
    retailByProduct,
  });

  const categoryRows = buildCategoryMetricRows(categoryBuckets, daysInPeriod);
  const totalCategoryRevenue = categoryRows.reduce((s, c) => s + c.revenue, 0);

  const categoriesBySales = sortCategoriesBySales(categoryRows).slice(0, 10);
  const categoriesByMargin = sortCategoriesByMarginContribution(
    categoryRows,
    totalCategoryRevenue
  ).slice(0, 10);
  const categoriesByVelocity = sortCategoriesByVelocity(categoryRows).slice(0, 10);

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
        categoryName: resolveCategoryName(
          meta?.categoryId ?? null,
          categoryName
        ),
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

  const inventoryInsights = buildInventoryDecisionInsights({
    categories: categoryRows,
    fastMoving: fastMovingProducts,
    purchaseHints,
    costRetailMargin,
    stockBuildUpCost,
    stockValueChangePct,
    closingStockValue,
    potentialMargin,
    lowStockCount,
    periodLabel: `${from} → ${to}`,
  });

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
    openingRetailStockValue,
    closingRetailStockValue,
    stockBuildUpCost,
    stockBuildUpRetail,
    potentialMargin,
    skusWithQty: snapshot.skusWithQty,
    stockValueChangePct,
    retailStockValueChangePct,
    costRetailMargin,
    categoriesBySales,
    categoriesByMargin,
    categoriesByVelocity,
    fastMovingProducts,
    purchaseHints,
    lowStockCount,
    inventoryInsights,
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
    .filter((c) => c.margin >= 100_000 && c.marginPct >= 15)
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
