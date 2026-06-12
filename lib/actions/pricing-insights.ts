"use server";

import { format, subDays, subMonths, parseISO } from "date-fns";
import { analyzeCategorySeasonality } from "@/lib/analytics/seasonal-insights";
import {
  computePriceRecommendation,
  computeProductBundles,
  needsPriceAdjustment,
  type PriceRecommendation,
  type ProductBundleSuggestion,
} from "@/lib/analytics/pricing-insights";
import { fetchCategorySalesByMonth } from "@/lib/actions/seasonal-analytics";
import { listProductPriceCatalog } from "@/lib/actions/inventory";
import { getOrgRetailMarginPct } from "@/lib/pricing/org-retail-margin";
import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { roundMoney } from "@/lib/utils/calculations";

export type { PriceRecommendation, ProductBundleSuggestion } from "@/lib/analytics/pricing-insights";

export type PricingInsightsReport = {
  recommendations: PriceRecommendation[];
  adjustmentCount: number;
  bundles: ProductBundleSuggestion[];
};

function periodBounds(fromDate: string, toDate: string) {
  return {
    from: `${fromDate}T00:00:00.000Z`,
    to: `${toDate}T23:59:59.999Z`,
  };
}

async function fetchProductSalesStats(
  organizationId: string,
  outletId: string,
  productIds: string[],
  fromDate: string,
  toDate: string
) {
  const { from, to } = periodBounds(fromDate, toDate);
  const stats = new Map<
    string,
    { qty: number; revenue: number }
  >();
  for (const id of productIds) stats.set(id, { qty: 0, revenue: 0 });
  if (productIds.length === 0) return stats;

  const supabase = await createServerSupabaseClient();
  const sales = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("outlet_id", outletId)
      .eq("status", "completed")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  const saleIds = sales.map((s) => s.id);
  if (saleIds.length === 0) return stats;

  const items = await fetchByInChunks(saleIds, async (chunk) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("product_id, quantity, total_price")
      .in("sale_id", chunk)
      .in("product_id", productIds);
    return { data, error };
  });

  for (const row of items) {
    if (!row.product_id) continue;
    const prev = stats.get(row.product_id) ?? { qty: 0, revenue: 0 };
    stats.set(row.product_id, {
      qty: prev.qty + Number(row.quantity),
      revenue: prev.revenue + Number(row.total_price),
    });
  }

  return stats;
}

async function fetchBulkCostTrendPct(
  organizationId: string,
  outletId: string,
  productIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (productIds.length === 0) return result;

  const supabase = await createServerSupabaseClient();
  const toDate = format(new Date(), "yyyy-MM-dd");
  const midDate = format(subDays(parseISO(toDate), 45), "yyyy-MM-dd");
  const fromDate = format(subDays(parseISO(toDate), 90), "yyyy-MM-dd");
  const { from, to } = periodBounds(fromDate, toDate);
  const midIso = `${midDate}T00:00:00.000Z`;

  type MovementRow = {
    product_id: string | null;
    quantity: number;
    unit_cost: number | null;
    created_at: string;
  };
  const movementRows: MovementRow[] = [];

  const idChunks: string[][] = [];
  for (let i = 0; i < productIds.length; i += 80) {
    idChunks.push(productIds.slice(i, i + 80));
  }

  for (const chunk of idChunks) {
    const rows = await fetchAllPaginated(async (fromIdx, toIdx) => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("product_id, quantity, unit_cost, created_at")
        .eq("organization_id", organizationId)
        .eq("outlet_id", outletId)
        .eq("movement_type", "purchase")
        .gte("created_at", from)
        .lte("created_at", to)
        .in("product_id", chunk)
        .order("created_at", { ascending: true })
        .range(fromIdx, toIdx);
      return { data, error };
    });
    movementRows.push(...rows);
  }

  const byProduct = new Map<
    string,
    { recentSum: number; recentQty: number; priorSum: number; priorQty: number }
  >();

  for (const m of movementRows) {
    if (!m.product_id) continue;
    const cost = Number(m.unit_cost ?? 0);
    const qty = Number(m.quantity);
    if (cost <= 0 || qty <= 0) continue;
    const bucket = byProduct.get(m.product_id) ?? {
      recentSum: 0,
      recentQty: 0,
      priorSum: 0,
      priorQty: 0,
    };
    if (m.created_at >= midIso) {
      bucket.recentSum += cost * qty;
      bucket.recentQty += qty;
    } else {
      bucket.priorSum += cost * qty;
      bucket.priorQty += qty;
    }
    byProduct.set(m.product_id, bucket);
  }

  for (const [pid, b] of Array.from(byProduct.entries())) {
    if (b.recentQty === 0 || b.priorQty === 0) continue;
    const recentAvg = b.recentSum / b.recentQty;
    const priorAvg = b.priorSum / b.priorQty;
    if (priorAvg <= 0) continue;
    result.set(pid, roundMoney(((recentAvg - priorAvg) / priorAvg) * 100));
  }

  return result;
}

function seasonalMultiplierForCategory(
  categoryName: string,
  categoryTrends: ReturnType<typeof analyzeCategorySeasonality>,
  currentMonthLabel: string
): number {
  const trend = categoryTrends.find((t) => t.categoryName === categoryName);
  if (!trend) return 1;
  if (trend.peakMonth === currentMonthLabel) return 1.05;
  if (trend.quietMonth === currentMonthLabel) return 0.98;
  return 1;
}

export async function getPricingRecommendations(
  outletId?: string | null,
  productIds?: string[]
): Promise<PricingInsightsReport> {
  const ctx = await requireOrgContext();
  const filterOutlet = outletId ?? ctx.outletId;
  if (!filterOutlet) {
    return { recommendations: [], adjustmentCount: 0, bundles: [] };
  }

  const [catalog, marginPct, categoryRows] = await Promise.all([
    listProductPriceCatalog(filterOutlet),
    getOrgRetailMarginPct(),
    fetchCategorySalesByMonth(ctx.organizationId, filterOutlet),
  ]);

  const categoryTrends = analyzeCategorySeasonality(categoryRows);
  const currentMonthLabel = format(new Date(), "MMM yyyy");

  let products = catalog;
  if (productIds?.length) {
    const idSet = new Set(productIds);
    products = catalog.filter((p) => idSet.has(p.id));
  } else {
    products = products
      .filter(
        (p) =>
          p.costPrice > 0 &&
          (p.retailPrice == null ||
            p.retailPrice < p.costPrice ||
            p.stockQty > 0)
      )
      .slice(0, 120);
  }

  const ids = products.map((p) => p.id);
  const toDate = format(new Date(), "yyyy-MM-dd");
  const from90 = format(subDays(parseISO(toDate), 89), "yyyy-MM-dd");

  const [salesStats, costTrends] = await Promise.all([
    fetchProductSalesStats(
      ctx.organizationId,
      filterOutlet,
      ids,
      from90,
      toDate
    ),
    fetchBulkCostTrendPct(ctx.organizationId, filterOutlet, ids),
  ]);

  const recommendations: PriceRecommendation[] = [];

  for (const p of products) {
    const stat = salesStats.get(p.id) ?? { qty: 0, revenue: 0 };
    const avgSell =
      stat.qty > 0 ? roundMoney(stat.revenue / stat.qty) : null;
    const costChangePct = costTrends.get(p.id) ?? null;
    const seasonalMultiplier = seasonalMultiplierForCategory(
      p.categoryName,
      categoryTrends,
      currentMonthLabel
    );

    const costForRec =
      p.costPrice > 0 ? p.costPrice : stat.qty > 0 ? p.costPrice : 0;

    recommendations.push({
      ...computePriceRecommendation({
        productId: p.id,
        cost: costForRec,
        currentRetail: p.retailPrice,
        targetMarginPct: marginPct,
        avgSellPrice: avgSell,
        quantitySold90d: roundMoney(stat.qty),
        costChangePct,
        seasonalMultiplier,
      }),
      productName: p.name,
    });
  }

  const adjustmentCount = recommendations.filter(needsPriceAdjustment).length;
  const bundles = await getProductBundleSuggestions(filterOutlet);

  return { recommendations, adjustmentCount, bundles };
}

export async function getProductPricingRecommendation(
  outletId: string,
  productId: string,
  proposedUnitCost?: number
): Promise<PriceRecommendation | null> {
  const report = await getPricingRecommendations(outletId, [productId]);
  let rec = report.recommendations[0] ?? null;
  if (!rec) return null;

  if (proposedUnitCost != null && proposedUnitCost > 0) {
    const ctx = await requireOrgContext();
    const [marginPct, categoryRows, catalog] = await Promise.all([
      getOrgRetailMarginPct(),
      fetchCategorySalesByMonth(ctx.organizationId, outletId),
      listProductPriceCatalog(outletId),
    ]);
    const product = catalog.find((p) => p.id === productId);
    const categoryTrends = analyzeCategorySeasonality(categoryRows);
    const currentMonthLabel = format(new Date(), "MMM yyyy");
    const toDate = format(new Date(), "yyyy-MM-dd");
    const from90 = format(subDays(parseISO(toDate), 89), "yyyy-MM-dd");
    const stats = await fetchProductSalesStats(
      ctx.organizationId,
      outletId,
      [productId],
      from90,
      toDate
    );
    const stat = stats.get(productId) ?? { qty: 0, revenue: 0 };
    const avgSell =
      stat.qty > 0 ? roundMoney(stat.revenue / stat.qty) : null;
    const storedCost = product?.costPrice ?? 0;
    const trends = await fetchBulkCostTrendPct(
      ctx.organizationId,
      outletId,
      [productId]
    );
    const costChangePct =
      storedCost > 0
        ? roundMoney(((proposedUnitCost - storedCost) / storedCost) * 100)
        : (trends.get(productId) ?? null);

    rec = {
      ...computePriceRecommendation({
        productId,
        cost: proposedUnitCost,
        currentRetail: product?.retailPrice ?? null,
        targetMarginPct: marginPct,
        avgSellPrice: avgSell,
        quantitySold90d: roundMoney(stat.qty),
        costChangePct,
        seasonalMultiplier: seasonalMultiplierForCategory(
          product?.categoryName ?? "General",
          categoryTrends,
          currentMonthLabel
        ),
      }),
      productName: product?.name,
    };
  }

  return rec;
}

export async function getProductBundleSuggestions(
  outletId?: string | null
): Promise<ProductBundleSuggestion[]> {
  const ctx = await requireOrgContext();
  const filterOutlet = outletId ?? ctx.outletId;
  if (!filterOutlet) return [];

  const supabase = await createServerSupabaseClient();
  const toDate = format(new Date(), "yyyy-MM-dd");
  const fromDate = format(subMonths(parseISO(toDate), 3), "yyyy-MM-dd");
  const { from, to } = periodBounds(fromDate, toDate);

  const sales = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id")
      .eq("organization_id", ctx.organizationId)
      .eq("outlet_id", filterOutlet)
      .eq("status", "completed")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  if (sales.length < 5) return [];

  const saleIds = sales.map((s) => s.id);
  const items = await fetchByInChunks(saleIds, async (chunk) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, product_id")
      .in("sale_id", chunk);
    return { data, error };
  });

  const bySale = new Map<string, string[]>();
  for (const row of items) {
    if (!row.sale_id || !row.product_id) continue;
    const list = bySale.get(row.sale_id) ?? [];
    list.push(row.product_id);
    bySale.set(row.sale_id, list);
  }

  const basketSales = Array.from(bySale.entries())
    .filter(([, ids]) => new Set(ids).size >= 2)
    .map(([saleId, productIds]) => ({ saleId, productIds }));

  if (basketSales.length < 5) return [];

  const catalog = await listProductPriceCatalog(filterOutlet);
  const productNames = new Map(catalog.map((p) => [p.id, p.name]));
  const retailByProduct = new Map(
    catalog.map((p) => [p.id, p.retailPrice ?? 0])
  );
  const costByProduct = new Map(catalog.map((p) => [p.id, p.costPrice]));

  return computeProductBundles({
    sales: basketSales,
    productNames,
    retailByProduct,
    costByProduct,
  });
}
