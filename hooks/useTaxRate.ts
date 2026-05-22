"use client";

import { useOrgSettingsStore } from "@/stores/orgSettingsStore";

/** Tax rate for UI totals: 0 when VAT is disabled in settings. */
export function useTaxRate(): number {
  const enabled = useOrgSettingsStore((s) => s.vatEnabled);
  const rate = useOrgSettingsStore((s) => s.defaultVatRate);
  return enabled ? rate : 0;
}

export function useVatEnabled(): boolean {
  return useOrgSettingsStore((s) => s.vatEnabled);
}
