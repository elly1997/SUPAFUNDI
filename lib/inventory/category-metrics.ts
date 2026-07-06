import {
  resolveCategoryName,
  UNCATEGORIZED_CATEGORY,
} from "@/lib/products/catalog-grouping";
import { roundMoney } from "@/lib/utils/calculations";

/** Stable key for grouping — merges uncategorized products with a "General" category. */
export function categoryAggregationKey(displayName: string): string {
  return displayName.trim().toLowerCase();
}

export type ProductSalesAgg = {
  revenue: number;
  qty: number;
  cost: number;
};

export type CategoryAggBucket = {
  displayName: string;
  categoryId: string | null;
  revenue: number;
  qtySold: number;
  cost: number;
  stockQty: number;
  stockCostValue: number;
  stockRetailValue: number;
};

export type CategoryMetricRow = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  quantitySold: number;
  cost: number;
  margin: number;
  marginPct: number;
  /** Days of stock cover at current POS velocity (category totals). */
  avgDaysOnShelf: number | null;
  turnoverRate: number;
  stockQty: number;
  stockCostValue: number;
  stockRetailValue: number;
  stockMarginPct: number;
};

function displayCategoryName(
  categoryId: string | null,
  categoryNameById: Map<string, string>
): string {
  const raw = resolveCategoryName(categoryId, categoryNameById);
  if (
    categoryAggregationKey(raw) ===
    categoryAggregationKey(UNCATEGORIZED_CATEGORY)
  ) {
    return UNCATEGORIZED_CATEGORY;
  }
  return raw.trim() || UNCATEGORIZED_CATEGORY;
}

function emptyBucket(
  displayName: string,
  categoryId: string | null
): CategoryAggBucket {
  return {
    displayName,
    categoryId,
    revenue: 0,
    qtySold: 0,
    cost: 0,
    stockQty: 0,
    stockCostValue: 0,
    stockRetailValue: 0,
  };
}

/** Roll product sales and on-hand stock into merged category buckets. */
export function buildCategoryBuckets(input: {
  productIds: string[];
  byProduct: Map<string, ProductSalesAgg>;
  productCategoryId: Map<string, string | null>;
  categoryNameById: Map<string, string>;
  qtyNow: Map<string, number>;
  costByProduct: Map<string, number>;
  retailByProduct: Map<string, number>;
}): Map<string, CategoryAggBucket> {
  const {
    productIds,
    byProduct,
    productCategoryId,
    categoryNameById,
    qtyNow,
    costByProduct,
    retailByProduct,
  } = input;

  const buckets = new Map<string, CategoryAggBucket>();

  function ensureBucket(categoryId: string | null): CategoryAggBucket {
    const label = displayCategoryName(categoryId, categoryNameById);
    const key = categoryAggregationKey(label);
    const existing = buckets.get(key);
    if (existing) return existing;
    const bucket = emptyBucket(label, categoryId);
    buckets.set(key, bucket);
    return bucket;
  }

  for (const productId of productIds) {
    const categoryId = productCategoryId.get(productId) ?? null;
    const bucket = ensureBucket(categoryId);
    const qty = qtyNow.get(productId) ?? 0;
    const cost = costByProduct.get(productId) ?? 0;
    const retail = retailByProduct.get(productId) ?? 0;
    bucket.stockQty += qty;
    bucket.stockCostValue += qty * cost;
    bucket.stockRetailValue += qty * retail;
  }

  for (const [productId, agg] of Array.from(byProduct.entries())) {
    const categoryId = productCategoryId.get(productId) ?? null;
    const bucket = ensureBucket(categoryId);
    bucket.revenue += agg.revenue;
    bucket.qtySold += agg.qty;
    bucket.cost += agg.cost;
  }

  for (const bucket of Array.from(buckets.values())) {
    bucket.revenue = roundMoney(bucket.revenue);
    bucket.qtySold = roundMoney(bucket.qtySold);
    bucket.cost = roundMoney(bucket.cost);
    bucket.stockQty = roundMoney(bucket.stockQty);
    bucket.stockCostValue = roundMoney(bucket.stockCostValue);
    bucket.stockRetailValue = roundMoney(bucket.stockRetailValue);
  }

  return buckets;
}

export function bucketToMetricRow(
  bucket: CategoryAggBucket,
  daysInPeriod: number
): CategoryMetricRow {
  const margin = roundMoney(bucket.revenue - bucket.cost);
  const marginPct =
    bucket.revenue > 0 ? roundMoney((margin / bucket.revenue) * 100) : 0;
  const dailySales = bucket.qtySold / daysInPeriod;
  const avgDaysOnShelf =
    bucket.stockQty > 0 && dailySales > 0
      ? roundMoney(bucket.stockQty / dailySales)
      : bucket.qtySold > 0
        ? null
        : null;
  const turnoverRate =
    bucket.stockQty > 0
      ? roundMoney(bucket.qtySold / bucket.stockQty)
      : bucket.qtySold > 0
        ? 99
        : 0;
  const stockMarginPct =
    bucket.stockRetailValue > 0
      ? roundMoney(
          ((bucket.stockRetailValue - bucket.stockCostValue) /
            bucket.stockRetailValue) *
            100
        )
      : 0;

  return {
    categoryId: bucket.categoryId,
    categoryName: bucket.displayName,
    revenue: bucket.revenue,
    quantitySold: bucket.qtySold,
    cost: bucket.cost,
    margin,
    marginPct,
    avgDaysOnShelf,
    turnoverRate,
    stockQty: bucket.stockQty,
    stockCostValue: bucket.stockCostValue,
    stockRetailValue: bucket.stockRetailValue,
    stockMarginPct,
  };
}

export function buildCategoryMetricRows(
  buckets: Map<string, CategoryAggBucket>,
  daysInPeriod: number
): CategoryMetricRow[] {
  return Array.from(buckets.values()).map((b) =>
    bucketToMetricRow(b, daysInPeriod)
  );
}

/** Ignore tiny sales lines that distort margin %. */
export function minCategoryRevenueThreshold(totalRevenue: number): number {
  return Math.max(100_000, roundMoney(totalRevenue * 0.02));
}

export function sortCategoriesBySales(
  rows: CategoryMetricRow[]
): CategoryMetricRow[] {
  return [...rows].sort((a, b) => b.revenue - a.revenue);
}

/** Rank by profit contribution (TZS), not % — meaningful for purchasing decisions. */
export function sortCategoriesByMarginContribution(
  rows: CategoryMetricRow[],
  totalRevenue: number
): CategoryMetricRow[] {
  const minRev = minCategoryRevenueThreshold(totalRevenue);
  return [...rows]
    .filter((r) => r.revenue >= minRev)
    .sort((a, b) => b.margin - a.margin);
}

export function sortCategoriesByVelocity(
  rows: CategoryMetricRow[]
): CategoryMetricRow[] {
  return [...rows]
    .filter((r) => r.quantitySold > 0)
    .sort((a, b) => {
      const da = a.avgDaysOnShelf ?? 9999;
      const db = b.avgDaysOnShelf ?? 9999;
      return da - db;
    });
}

/** COGS from sale stock movements; falls back to catalog cost when movement cost missing. */
export function finalizeProductCogs(
  byProduct: Map<string, ProductSalesAgg>,
  costByProduct: Map<string, number>
): void {
  for (const [pid, agg] of Array.from(byProduct.entries())) {
    if (agg.cost === 0 && agg.qty > 0) {
      agg.cost = roundMoney(agg.qty * (costByProduct.get(pid) ?? 0));
    } else {
      agg.cost = roundMoney(agg.cost);
    }
    agg.revenue = roundMoney(agg.revenue);
    agg.qty = roundMoney(agg.qty);
  }
}

export function saleMovementLineCost(quantity: number, unitCost: number | null): number {
  return Math.abs(Number(quantity)) * Number(unitCost ?? 0);
}
