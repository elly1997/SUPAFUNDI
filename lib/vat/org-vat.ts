import { getOrganizationSettings } from "@/lib/actions/settings";
import { computeVat } from "@/lib/utils/calculations";

export type OrgVatConfig = {
  enabled: boolean;
  rate: number;
};

/** Read VAT settings for the current org (server). */
export async function getOrgVatConfig(): Promise<OrgVatConfig> {
  const settings = await getOrganizationSettings();
  if (!settings) {
    return { enabled: false, rate: 0 };
  }
  return {
    enabled: settings.vatEnabled,
    rate: settings.defaultVatRate,
  };
}

/** Apply org VAT toggle to a requested rate (e.g. from client payload). */
export function effectiveTaxRate(
  config: OrgVatConfig,
  requestedRate?: number
): number {
  if (!config.enabled) return 0;
  const rate = requestedRate ?? config.rate;
  return Number.isFinite(rate) && rate >= 0 ? rate : config.rate;
}

export function computeTaxAmount(
  subtotal: number,
  config: OrgVatConfig,
  requestedRate?: number
): number {
  const rate = effectiveTaxRate(config, requestedRate);
  if (rate <= 0) return 0;
  return computeVat(subtotal, rate);
}
