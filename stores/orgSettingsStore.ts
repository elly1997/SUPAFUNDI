"use client";

import { create } from "zustand";

type OrgSettingsState = {
  vatEnabled: boolean;
  defaultVatRate: number;
  defaultRetailMarginPct: number;
  hydrated: boolean;
  setOrgSettings: (s: {
    vatEnabled: boolean;
    defaultVatRate: number;
    defaultRetailMarginPct: number;
  }) => void;
};

export const useOrgSettingsStore = create<OrgSettingsState>((set) => ({
  vatEnabled: false,
  defaultVatRate: 18,
  defaultRetailMarginPct: 40,
  hydrated: false,
  setOrgSettings: ({ vatEnabled, defaultVatRate, defaultRetailMarginPct }) =>
    set({ vatEnabled, defaultVatRate, defaultRetailMarginPct, hydrated: true }),
}));
