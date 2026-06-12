import { format, getDate, getDay, parseISO } from "date-fns";
import { roundMoney } from "@/lib/utils/calculations";

export type SeasonalTendency = "peak" | "quiet" | "normal";

export type SeasonalPattern = {
  label: string;
  key: string;
  type: "weekday" | "month_part" | "calendar_month";
  avgSales: number;
  totalSales: number;
  dayCount: number;
  /** 1.0 = period average; 1.2 = 20% above average. */
  indexVsAverage: number;
  tendency: SeasonalTendency;
};

export type SeasonalInsight = {
  id: string;
  title: string;
  body: string;
  action: string;
  severity: "info" | "positive" | "warning";
};

export type CategorySeasonalTrend = {
  categoryName: string;
  peakMonth: string;
  peakMonthRevenue: number;
  quietMonth: string;
  quietMonthRevenue: number;
  message: string;
};

export type SeasonalAnalysis = {
  hasEnoughData: boolean;
  lookbackDays: number;
  overallAvgDaily: number;
  weekdayPattern: SeasonalPattern[];
  strongestWeekday: SeasonalPattern | null;
  quietestWeekday: SeasonalPattern | null;
  /** Positive = weekends busier than weekdays (% difference). */
  weekendVsWeekdayPct: number | null;
  monthPartPattern: SeasonalPattern[];
  calendarMonthPattern: SeasonalPattern[];
  strongestMonth: SeasonalPattern | null;
  quietestMonth: SeasonalPattern | null;
  insights: SeasonalInsight[];
};

export type DailySalesPoint = { date: string; total: number };

export type CategoryMonthSales = {
  categoryName: string;
  monthKey: string;
  monthLabel: string;
  revenue: number;
};

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTH_PARTS = [
  { key: "early", label: "Month start (1–10)", test: (d: number) => d <= 10 },
  { key: "mid", label: "Mid-month (11–20)", test: (d: number) => d >= 11 && d <= 20 },
  { key: "late", label: "Month end (21–31)", test: (d: number) => d >= 21 },
] as const;

function tendencyFromIndex(index: number): SeasonalTendency {
  if (index >= 1.15) return "peak";
  if (index <= 0.85) return "quiet";
  return "normal";
}

function buildPatterns(
  buckets: Map<string, { label: string; type: SeasonalPattern["type"]; total: number; days: number }>,
  overallAvg: number
): SeasonalPattern[] {
  return Array.from(buckets.entries())
    .map(([key, b]) => {
      const avgSales = b.days > 0 ? roundMoney(b.total / b.days) : 0;
      const indexVsAverage =
        overallAvg > 0 ? roundMoney(avgSales / overallAvg) : 1;
      return {
        label: b.label,
        key,
        type: b.type,
        avgSales,
        totalSales: roundMoney(b.total),
        dayCount: b.days,
        indexVsAverage,
        tendency: tendencyFromIndex(indexVsAverage),
      };
    })
    .sort((a, b) => b.avgSales - a.avgSales);
}

/** Analyse daily sales for weekday, month-part, and calendar-month seasonality. */
export function analyzeSeasonalSales(
  dailyPoints: DailySalesPoint[]
): SeasonalAnalysis {
  const empty: SeasonalAnalysis = {
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
  };

  if (dailyPoints.length < 7) return empty;

  const byDate = new Map<string, number>();
  for (const p of dailyPoints) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.total);
  }

  const days = Array.from(byDate.entries()).map(([date, total]) => ({
    date,
    total,
  }));

  const overallTotal = days.reduce((s, d) => s + d.total, 0);
  const overallAvg = days.length > 0 ? overallTotal / days.length : 0;

  const weekdayBuckets = new Map<
    string,
    { label: string; type: SeasonalPattern["type"]; total: number; days: number }
  >();
  for (let i = 0; i < 7; i++) {
    weekdayBuckets.set(String(i), {
      label: WEEKDAY_LABELS[i],
      type: "weekday",
      total: 0,
      days: 0,
    });
  }

  const monthPartBuckets = new Map<
    string,
    { label: string; type: SeasonalPattern["type"]; total: number; days: number }
  >();
  for (const part of MONTH_PARTS) {
    monthPartBuckets.set(part.key, {
      label: part.label,
      type: "month_part",
      total: 0,
      days: 0,
    });
  }

  const monthBuckets = new Map<
    string,
    { label: string; type: SeasonalPattern["type"]; total: number; days: number }
  >();

  for (const d of days) {
    const parsed = parseISO(d.date);
    const dow = getDay(parsed);
    const dom = getDate(parsed);
    const monthKey = format(parsed, "yyyy-MM");

    const wd = weekdayBuckets.get(String(dow))!;
    wd.total += d.total;
    wd.days += 1;

    for (const part of MONTH_PARTS) {
      if (part.test(dom)) {
        const mp = monthPartBuckets.get(part.key)!;
        mp.total += d.total;
        mp.days += 1;
        break;
      }
    }

    if (!monthBuckets.has(monthKey)) {
      monthBuckets.set(monthKey, {
        label: format(parsed, "MMM yyyy"),
        type: "calendar_month",
        total: 0,
        days: 0,
      });
    }
    const mb = monthBuckets.get(monthKey)!;
    mb.total += d.total;
    mb.days += 1;
  }

  const weekdayPattern = buildPatterns(weekdayBuckets, overallAvg).sort(
    (a, b) => WEEKDAY_LABELS.indexOf(a.label as (typeof WEEKDAY_LABELS)[number]) -
      WEEKDAY_LABELS.indexOf(b.label as (typeof WEEKDAY_LABELS)[number])
  );
  const monthPartPattern = buildPatterns(monthPartBuckets, overallAvg).sort(
    (a, b) =>
      MONTH_PARTS.findIndex((p) => p.key === a.key) -
      MONTH_PARTS.findIndex((p) => p.key === b.key)
  );
  const calendarMonthPattern = buildPatterns(monthBuckets, overallAvg).sort(
    (a, b) => a.key.localeCompare(b.key)
  );

  const withWeekdayData = weekdayPattern.filter((p) => p.dayCount > 0);
  const strongestWeekday =
    withWeekdayData.length > 0
      ? withWeekdayData.reduce((best, p) =>
          p.avgSales > best.avgSales ? p : best
        )
      : null;
  const quietestWeekday =
    withWeekdayData.length > 0
      ? withWeekdayData.reduce((best, p) =>
          p.avgSales < best.avgSales ? p : best
        )
      : null;

  const weekdayTotal = withWeekdayData
    .filter((p) => !["Saturday", "Sunday"].includes(p.label))
    .reduce((s, p) => s + p.totalSales, 0);
  const weekdayDays = withWeekdayData
    .filter((p) => !["Saturday", "Sunday"].includes(p.label))
    .reduce((s, p) => s + p.dayCount, 0);
  const weekendTotal = withWeekdayData
    .filter((p) => ["Saturday", "Sunday"].includes(p.label))
    .reduce((s, p) => s + p.totalSales, 0);
  const weekendDays = withWeekdayData
    .filter((p) => ["Saturday", "Sunday"].includes(p.label))
    .reduce((s, p) => s + p.dayCount, 0);

  let weekendVsWeekdayPct: number | null = null;
  if (weekdayDays > 0 && weekendDays > 0) {
    const weekdayAvg = weekdayTotal / weekdayDays;
    const weekendAvg = weekendTotal / weekendDays;
    if (weekdayAvg > 0) {
      weekendVsWeekdayPct = roundMoney(
        ((weekendAvg - weekdayAvg) / weekdayAvg) * 100
      );
    }
  }

  const monthsWithData = calendarMonthPattern.filter((p) => p.dayCount >= 3);
  const strongestMonth =
    monthsWithData.length > 0
      ? monthsWithData.reduce((best, p) =>
          p.avgSales > best.avgSales ? p : best
        )
      : null;
  const quietestMonth =
    monthsWithData.length > 0
      ? monthsWithData.reduce((best, p) =>
          p.avgSales < best.avgSales ? p : best
        )
      : null;

  const insights = buildSeasonalInsights({
    weekdayPattern: withWeekdayData,
    strongestWeekday,
    quietestWeekday,
    weekendVsWeekdayPct,
    monthPartPattern: monthPartPattern.filter((p) => p.dayCount > 0),
    strongestMonth,
    quietestMonth,
    overallAvg,
    lookbackDays: days.length,
  });

  return {
    hasEnoughData: days.length >= 14,
    lookbackDays: days.length,
    overallAvgDaily: roundMoney(overallAvg),
    weekdayPattern,
    strongestWeekday,
    quietestWeekday,
    weekendVsWeekdayPct,
    monthPartPattern,
    calendarMonthPattern,
    strongestMonth,
    quietestMonth,
    insights,
  };
}

function buildSeasonalInsights(ctx: {
  weekdayPattern: SeasonalPattern[];
  strongestWeekday: SeasonalPattern | null;
  quietestWeekday: SeasonalPattern | null;
  weekendVsWeekdayPct: number | null;
  monthPartPattern: SeasonalPattern[];
  strongestMonth: SeasonalPattern | null;
  quietestMonth: SeasonalPattern | null;
  overallAvg: number;
  lookbackDays: number;
}): SeasonalInsight[] {
  const insights: SeasonalInsight[] = [];

  if (
    ctx.strongestWeekday &&
    ctx.strongestWeekday.tendency === "peak" &&
    ctx.strongestWeekday.dayCount >= 2
  ) {
    insights.push({
      id: "peak-weekday",
      title: `${ctx.strongestWeekday.label}s run strongest`,
      body: `Average ${formatTzsShort(ctx.strongestWeekday.avgSales)} per ${ctx.strongestWeekday.label} (${Math.round((ctx.strongestWeekday.indexVsAverage - 1) * 100)}% above your daily norm).`,
      action:
        "Stock fast movers before this day each week; schedule staff for counter coverage.",
      severity: "positive",
    });
  }

  if (
    ctx.quietestWeekday &&
    ctx.quietestWeekday.tendency === "quiet" &&
    ctx.quietestWeekday.dayCount >= 2 &&
    ctx.quietestWeekday.label !== ctx.strongestWeekday?.label
  ) {
    insights.push({
      id: "quiet-weekday",
      title: `${ctx.quietestWeekday.label}s are typically quieter`,
      body: `About ${formatTzsShort(ctx.quietestWeekday.avgSales)}/day on ${ctx.quietestWeekday.label}s — use for stock counts, supplier follow-ups, and delayed purchases.`,
      action: "Avoid large PO deliveries on quiet days; protect cash for peak days.",
      severity: "info",
    });
  }

  if (ctx.weekendVsWeekdayPct != null && Math.abs(ctx.weekendVsWeekdayPct) >= 12) {
    const weekendsBusier = ctx.weekendVsWeekdayPct > 0;
    insights.push({
      id: "weekend-rhythm",
      title: weekendsBusier ? "Weekends outperform weekdays" : "Weekdays drive most trade",
      body: weekendsBusier
        ? `Weekend daily average is ${ctx.weekendVsWeekdayPct}% above Mon–Fri — typical for retail walk-in trade.`
        : `Weekday sales average ${Math.abs(ctx.weekendVsWeekdayPct)}% above weekends — contractor/wholesale rhythm.`,
      action: weekendsBusier
        ? "Increase retail-facing stock before Saturday; wholesale follow-ups on Monday."
        : "Prioritise wholesale quotes and deliveries on weekdays; lighter weekend staffing.",
      severity: "info",
    });
  }

  const lateMonth = ctx.monthPartPattern.find((p) => p.key === "late");
  const earlyMonth = ctx.monthPartPattern.find((p) => p.key === "early");
  if (
    lateMonth &&
    earlyMonth &&
    lateMonth.dayCount >= 3 &&
    earlyMonth.dayCount >= 3 &&
    lateMonth.indexVsAverage >= 1.12
  ) {
    insights.push({
      id: "month-end-surge",
      title: "Month-end sales surge detected",
      body: `Late month (21–31) averages ${formatTzsShort(lateMonth.avgSales)}/day vs ${formatTzsShort(earlyMonth.avgSales)} at month start — aligns with payroll and project spending cycles.`,
      action:
        "Build stock 5–7 days before month-end; collect customer credit in the first week of the new month.",
      severity: "positive",
    });
  } else if (
    earlyMonth &&
    lateMonth &&
    earlyMonth.indexVsAverage >= 1.12 &&
    earlyMonth.dayCount >= 3
  ) {
    insights.push({
      id: "month-start-surge",
      title: "Month-start spending pattern",
      body: `First 10 days average ${formatTzsShort(earlyMonth.avgSales)}/day — customers restock after payday at month open.`,
      action: "Receive POs in the last week of the prior month so shelves are full on the 1st.",
      severity: "positive",
    });
  }

  if (
    ctx.strongestMonth &&
    ctx.quietestMonth &&
    ctx.strongestMonth.key !== ctx.quietestMonth.key &&
    monthsApart(ctx.strongestMonth.key, ctx.quietestMonth.key) >= 1
  ) {
    const spread =
      ctx.quietestMonth.avgSales > 0
        ? roundMoney(
            ((ctx.strongestMonth.avgSales - ctx.quietestMonth.avgSales) /
              ctx.quietestMonth.avgSales) *
              100
          )
        : 0;
    if (spread >= 20) {
      insights.push({
        id: "calendar-season",
        title: `${ctx.strongestMonth.label} is your busiest month`,
        body: `Daily average in ${ctx.strongestMonth.label} is ${spread}% above ${ctx.quietestMonth.label} — plan seasonal purchasing around this calendar rhythm.`,
        action: `Increase cover on top categories before ${ctx.strongestMonth.label}; trim slow POs before ${ctx.quietestMonth.label}.`,
        severity: spread >= 40 ? "warning" : "info",
      });
    }
  }

  if (insights.length === 0 && ctx.lookbackDays >= 14) {
    insights.push({
      id: "stable-pattern",
      title: "Sales rhythm is fairly even",
      body: `Across ${ctx.lookbackDays} days, no strong weekly or monthly spike yet — keep reconciling daily to sharpen patterns.`,
      action: "Extend the date range to 60–90 days for clearer seasonal signals.",
      severity: "info",
    });
  }

  return insights.slice(0, 5);
}

function monthsApart(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return Math.abs((ay - by) * 12 + (am - bm));
}

function formatTzsShort(n: number) {
  return `TZS ${Math.round(n).toLocaleString("en-TZ")}`;
}

/** Category demand by calendar month — for inventory seasonal allocation. */
export function analyzeCategorySeasonality(
  rows: CategoryMonthSales[]
): CategorySeasonalTrend[] {
  const byCategory = new Map<string, CategoryMonthSales[]>();
  for (const r of rows) {
    const list = byCategory.get(r.categoryName) ?? [];
    list.push(r);
    byCategory.set(r.categoryName, list);
  }

  const trends: CategorySeasonalTrend[] = [];

  for (const [categoryName, months] of Array.from(byCategory.entries())) {
    const withRevenue = months.filter((m) => m.revenue > 0);
    if (withRevenue.length < 2) continue;

    const peak = withRevenue.reduce((best, m) =>
      m.revenue > best.revenue ? m : best
    );
    const quiet = withRevenue.reduce((best, m) =>
      m.revenue < best.revenue ? m : best
    );
    if (peak.monthKey === quiet.monthKey) continue;

    const spread =
      quiet.revenue > 0
        ? roundMoney(((peak.revenue - quiet.revenue) / quiet.revenue) * 100)
        : 100;

    if (spread < 25) continue;

    trends.push({
      categoryName,
      peakMonth: peak.monthLabel,
      peakMonthRevenue: peak.revenue,
      quietMonth: quiet.monthLabel,
      quietMonthRevenue: quiet.revenue,
      message:
        spread >= 50
          ? `${categoryName} spikes in ${peak.monthLabel} (+${spread}% vs ${quiet.monthLabel}) — stock up 2–3 weeks before peak.`
          : `${categoryName} sells more in ${peak.monthLabel} than ${quiet.monthLabel} — adjust reorder timing.`,
    });
  }

  return trends
    .sort((a, b) => b.peakMonthRevenue - a.peakMonthRevenue)
    .slice(0, 6);
}

/** Merge inventory seasonal signals into purchase hints. */
export function buildInventorySeasonalInsights(
  salesSeasonal: SeasonalAnalysis,
  categoryTrends: CategorySeasonalTrend[],
  stockValueChangePct: number
): SeasonalInsight[] {
  const insights: SeasonalInsight[] = [...salesSeasonal.insights];

  for (const t of categoryTrends.slice(0, 3)) {
    insights.push({
      id: `cat-${t.categoryName}`,
      title: `${t.categoryName} seasonal demand`,
      body: t.message,
      action: `Review ${t.categoryName} reorder levels before ${t.peakMonth}.`,
      severity: "info",
    });
  }

  if (stockValueChangePct >= 15 && salesSeasonal.overallAvgDaily > 0) {
    insights.push({
      id: "stock-build-up",
      title: "Inventory value is building",
      body: `Stock at cost rose ${stockValueChangePct}% in this period — check that sales velocity supports the extra capital tied up.`,
      action:
        salesSeasonal.strongestMonth
          ? `If preparing for ${salesSeasonal.strongestMonth.label}, align POs to fast movers only.`
          : "Match purchases to weekday peaks; pause slow categories.",
      severity: "warning",
    });
  } else if (stockValueChangePct <= -10) {
    insights.push({
      id: "stock-drawdown",
      title: "Stock value fell in period",
      body: `Inventory at cost down ${Math.abs(stockValueChangePct)}% — either strong sales or fewer purchases.`,
      action: salesSeasonal.strongestWeekday
        ? `Replenish before next ${salesSeasonal.strongestWeekday.label} peak.`
        : "Replenish fast movers before the next busy week.",
      severity: "info",
    });
  }

  return insights.slice(0, 7);
}
