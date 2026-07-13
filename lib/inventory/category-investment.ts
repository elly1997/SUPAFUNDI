import type { CategoryMetricRow } from "@/lib/inventory/category-metrics";
import { roundMoney } from "@/lib/utils/calculations";

export type CategoryInvestmentRow = {
  categoryId: string | null;
  categoryName: string;
  revenue: number;
  margin: number;
  marginPct: number;
  stockCostValue: number;
  salesSharePct: number;
  capitalSharePct: number;
  /** Higher = invest more (strong sales/margin vs capital tied up). */
  investmentScore: number;
  /** Suggested % of next purchase budget. */
  suggestedBudgetPct: number;
  avgDaysOnShelf: number | null;
  action: "invest" | "maintain" | "reduce";
};

/**
 * Rank categories for capital allocation: favour high margin + sales share
 * relative to stock capital tied up.
 */
export function buildCategoryInvestmentScoreboard(
  categories: CategoryMetricRow[]
): CategoryInvestmentRow[] {
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0) || 1;
  const totalCapital =
    categories.reduce((s, c) => s + c.stockCostValue, 0) || 1;

  const scored = categories
    .filter((c) => c.revenue > 0 || c.stockCostValue > 0)
    .map((c) => {
      const salesSharePct = roundMoney((c.revenue / totalRevenue) * 100);
      const capitalSharePct = roundMoney((c.stockCostValue / totalCapital) * 100);
      const marginWeight = Math.max(0, c.marginPct) / 100;
      const salesWeight = c.revenue / totalRevenue;
      const capitalPenalty = c.stockCostValue / totalCapital;
      const coverBonus =
        c.avgDaysOnShelf != null && c.avgDaysOnShelf < 14 ? 0.15 : 0;
      const deadCapitalPenalty =
        c.avgDaysOnShelf != null && c.avgDaysOnShelf > 90 ? 0.2 : 0;

      const investmentScore = roundMoney(
        (salesWeight * 40 + marginWeight * 35 + coverBonus * 10) *
          100 -
          capitalPenalty * 25 -
          deadCapitalPenalty * 100
      );

      let action: CategoryInvestmentRow["action"] = "maintain";
      if (salesSharePct >= capitalSharePct + 5 && c.marginPct >= 15) {
        action = "invest";
      } else if (
        capitalSharePct >= salesSharePct + 8 ||
        (c.avgDaysOnShelf != null && c.avgDaysOnShelf > 90 && c.marginPct < 20)
      ) {
        action = "reduce";
      }

      return {
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        revenue: c.revenue,
        margin: c.margin,
        marginPct: c.marginPct,
        stockCostValue: c.stockCostValue,
        salesSharePct,
        capitalSharePct,
        investmentScore,
        suggestedBudgetPct: 0,
        avgDaysOnShelf: c.avgDaysOnShelf,
        action,
      };
    })
    .sort((a, b) => b.investmentScore - a.investmentScore);

  const investPool = scored.filter((r) => r.action === "invest");
  const maintainPool = scored.filter((r) => r.action === "maintain");
  const positiveScores = investPool.length
    ? investPool
    : maintainPool.length
      ? maintainPool
      : scored.slice(0, 5);

  const scoreSum =
    positiveScores.reduce((s, r) => s + Math.max(1, r.investmentScore), 0) || 1;

  for (const row of scored) {
    if (positiveScores.includes(row) && row.action !== "reduce") {
      row.suggestedBudgetPct = roundMoney(
        (Math.max(1, row.investmentScore) / scoreSum) * 100
      );
    } else {
      row.suggestedBudgetPct = 0;
    }
  }

  // Renormalise to ~100%
  const budgetSum =
    scored.reduce((s, r) => s + r.suggestedBudgetPct, 0) || 1;
  if (budgetSum > 0) {
    for (const row of scored) {
      if (row.suggestedBudgetPct > 0) {
        row.suggestedBudgetPct = roundMoney(
          (row.suggestedBudgetPct / budgetSum) * 100
        );
      }
    }
  }

  return scored;
}
