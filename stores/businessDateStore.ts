"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type BusinessDateState = {
  businessDate: string;
  setBusinessDate: (date: string) => void;
  resetToToday: () => void;
};

export const useBusinessDateStore = create<BusinessDateState>()(
  persist(
    (set) => ({
      businessDate: todayIso(),
      setBusinessDate: (businessDate) => set({ businessDate }),
      resetToToday: () => set({ businessDate: todayIso() }),
    }),
    { name: "hardwarepos-business-date" }
  )
);
