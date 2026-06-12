"use server";

import { format, subDays, subMonths, parseISO } from "date-fns";
import {
  analyzeCategorySeasonality,
  analyzeSeasonalSales,
  type CategoryMonthSales,
  type DailySalesPoint,
  type SeasonalAnalysis,
} from "@/lib/analytics/seasonal-insights";
import { getReconciledDatesInRange } from "@/lib/actions/daily-closing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  fetchAllPaginated,
  fetchByInChunks,
} from "@/lib/supabase/query-chunks";
import { businessDateFromTimestamptz } from "@/lib/utils/iso-date";
import { roundMoney } from "@/lib/utils/calculations";

function reportPeriodBounds(fromDate: string, toDate: string) {
  return {
    from: `${fromDate}T00:00:00.000Z`,
    to: `${toDate}T23:59:59.999Z`,
  };
}

/** Daily sales totals for seasonal lookback (up to 90 days ending at toDate). */
export async function fetchDailySalesForSeasonal(
  organizationId: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false,
  lookbackDays = 90
): Promise<DailySalesPoint[]> {
  const supabase = await createServerSupabaseClient();
  const fromDate = format(subDays(parseISO(toDate), lookbackDays - 1), "yyyy-MM-dd");
  const { from, to } = reportPeriodBounds(fromDate, toDate);

  let q = supabase
    .from("sales")
    .select("total_amount, sale_date")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (outletId) q = q.eq("outlet_id", outletId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  let rows = data ?? [];
  if (reconciledDaysOnly) {
    const reconciled = new Set(
      await getReconciledDatesInRange(fromDate, toDate, outletId)
    );
    rows = rows.filter((s) =>
      reconciled.has(businessDateFromTimestamptz(String(s.sale_date)))
    );
  }

  const byDay = new Map<string, number>();
  for (const s of rows) {
    const d = businessDateFromTimestamptz(String(s.sale_date));
    byDay.set(d, (byDay.get(d) ?? 0) + Number(s.total_amount));
  }

  return Array.from(byDay.entries())
    .map(([date, total]) => ({ date, total: roundMoney(total) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function computeSalesSeasonalAnalysis(
  organizationId: string,
  toDate: string,
  outletId?: string | null,
  reconciledDaysOnly = false
): Promise<SeasonalAnalysis> {
  const daily = await fetchDailySalesForSeasonal(
    organizationId,
    toDate,
    outletId,
    reconciledDaysOnly,
    90
  );
  return analyzeSeasonalSales(daily);
}

/** Category revenue by calendar month — last 12 months for inventory seasonality. */
export async function fetchCategorySalesByMonth(
  organizationId: string,
  outletId: string,
  asOfDate?: string
): Promise<CategoryMonthSales[]> {
  const supabase = await createServerSupabaseClient();
  const toDate = asOfDate ?? format(new Date(), "yyyy-MM-dd");
  const fromDate = format(subMonths(parseISO(toDate), 11), "yyyy-MM-dd");
  const { from, to } = reportPeriodBounds(fromDate, toDate);

  const sales = await fetchAllPaginated(async (fromIdx, toIdx) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, sale_date")
      .eq("organization_id", organizationId)
      .eq("outlet_id", outletId)
      .eq("status", "completed")
      .gte("sale_date", from)
      .lte("sale_date", to)
      .order("sale_date", { ascending: true })
      .range(fromIdx, toIdx);
    return { data, error };
  });

  if (sales.length === 0) return [];

  const saleIds = sales.map((s) => s.id);
  const saleMonth = new Map(
    sales.map((s) => [
      s.id,
      format(parseISO(businessDateFromTimestamptz(String(s.sale_date))), "yyyy-MM"),
    ])
  );

  const items = await fetchByInChunks(saleIds, async (chunk) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, product_id, total_price")
      .in("sale_id", chunk);
    return { data, error };
  });

  const productIds = Array.from(
    new Set(items.map((i) => i.product_id).filter(Boolean) as string[])
  );
  if (productIds.length === 0) return [];

  const { data: products } = await supabase
    .from("products")
    .select("id, category_id")
    .in("id", productIds);

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", organizationId);

  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const prodCat = new Map(
    (products ?? []).map((p) => [p.id, p.category_id as string | null])
  );

  const agg = new Map<string, number>();
  for (const item of items) {
    if (!item.sale_id || !item.product_id) continue;
    const monthKey = saleMonth.get(item.sale_id);
    if (!monthKey) continue;
    const catId = prodCat.get(item.product_id);
    const categoryName = catId
      ? (catName.get(catId) ?? "General")
      : "General";
    const key = `${categoryName}|${monthKey}`;
    agg.set(key, (agg.get(key) ?? 0) + Number(item.total_price));
  }

  return Array.from(agg.entries()).map(([key, revenue]) => {
    const [categoryName, monthKey] = key.split("|");
    const monthLabel = format(parseISO(`${monthKey}-01`), "MMM yyyy");
    return {
      categoryName,
      monthKey,
      monthLabel,
      revenue: roundMoney(revenue),
    };
  });
}

export async function computeCategorySeasonalTrends(
  organizationId: string,
  outletId: string,
  asOfDate?: string
) {
  const rows = await fetchCategorySalesByMonth(
    organizationId,
    outletId,
    asOfDate
  );
  return analyzeCategorySeasonality(rows);
}
