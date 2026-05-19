"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type SettingsState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  navExpanded: Record<string, boolean>;
  setNavExpanded: (sectionId: string, open: boolean) => void;
  toggleNavSection: (sectionId: string) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      navExpanded: {},
      setNavExpanded: (sectionId, open) =>
        set((s) => ({
          navExpanded: { ...s.navExpanded, [sectionId]: open },
        })),
      toggleNavSection: (sectionId) => {
        const current = get().navExpanded[sectionId];
        set((s) => ({
          navExpanded: {
            ...s.navExpanded,
            [sectionId]: current === undefined ? false : !current,
          },
        }));
      },
    }),
    { name: "hardwarepos-settings" }
  )
);

/** Section open if user preference set, else section defaultOpen. */
export function isNavSectionOpen(
  sectionId: string,
  defaultOpen: boolean | undefined,
  navExpanded: Record<string, boolean>
): boolean {
  if (sectionId in navExpanded) {
    return navExpanded[sectionId];
  }
  return defaultOpen ?? true;
}
