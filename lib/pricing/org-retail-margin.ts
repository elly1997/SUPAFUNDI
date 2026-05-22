import { getOrganizationSettings } from "@/lib/actions/settings";
import { retailPriceFromCost } from "@/lib/utils/calculations";

export async function getOrgRetailMarginPct(): Promise<number> {
  const settings = await getOrganizationSettings();
  const pct = settings?.defaultRetailMarginPct ?? 40;
  return Number.isFinite(pct) && pct >= 0 ? pct : 40;
}

export async function retailPriceForOrgCost(cost: number): Promise<number> {
  const margin = await getOrgRetailMarginPct();
  return retailPriceFromCost(cost, margin);
}
