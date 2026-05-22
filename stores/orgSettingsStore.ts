"use client";

import { create } from "zustand";

type OrgSettingsState = {
  vatEnabled: boolean;
  defaultVatRate: number;
  hydrated: boolean;
  setOrgSettings: (s: {
    vatEnabled: boolean;
    defaultVatRate: number;
  }) => void;
};

export const useOrgSettingsStore = create<OrgSettingsState>((set) => ({
  vatEnabled: false,
  defaultVatRate: 18,
  hydrated: false,
  setOrgSettings: ({ vatEnabled, defaultVatRate }) =>
    set({ vatEnabled, defaultVatRate, hydrated: true }),
}));
