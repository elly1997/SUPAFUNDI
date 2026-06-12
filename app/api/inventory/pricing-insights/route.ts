import { NextResponse } from "next/server";
import {
  getPricingRecommendations,
  getProductPricingRecommendation,
} from "@/lib/actions/pricing-insights";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const outletId = searchParams.get("outletId");
    const productId = searchParams.get("productId");
    const unitCostRaw = searchParams.get("unitCost");

    if (productId && outletId) {
      const unitCost =
        unitCostRaw != null && unitCostRaw !== ""
          ? Number(unitCostRaw)
          : undefined;
      const rec = await getProductPricingRecommendation(
        outletId,
        productId,
        Number.isFinite(unitCost) ? unitCost : undefined
      );
      return NextResponse.json({ recommendation: rec });
    }

    const productIdsParam = searchParams.get("productIds");
    const productIds = productIdsParam
      ? productIdsParam.split(",").filter(Boolean)
      : undefined;

    const report = await getPricingRecommendations(
      outletId,
      productIds
    );
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pricing insights failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
