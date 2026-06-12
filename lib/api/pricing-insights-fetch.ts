import type { PricingInsightsReport } from "@/lib/actions/pricing-insights";
import type { PriceRecommendation } from "@/lib/analytics/pricing-insights";

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function fetchPricingInsights(params: {
  outletId?: string | null;
  productIds?: string[];
}): Promise<PricingInsightsReport> {
  const q = new URLSearchParams();
  if (params.outletId) q.set("outletId", params.outletId);
  if (params.productIds?.length) {
    q.set("productIds", params.productIds.join(","));
  }
  const res = await fetch(`/api/inventory/pricing-insights?${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<PricingInsightsReport>;
}

export async function fetchProductPricingRecommendation(params: {
  outletId: string;
  productId: string;
  unitCost?: number;
}): Promise<PriceRecommendation | null> {
  const q = new URLSearchParams({
    outletId: params.outletId,
    productId: params.productId,
  });
  if (params.unitCost != null && params.unitCost > 0) {
    q.set("unitCost", String(params.unitCost));
  }
  const res = await fetch(`/api/inventory/pricing-insights?${q}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const body = (await res.json()) as { recommendation: PriceRecommendation | null };
  return body.recommendation;
}
