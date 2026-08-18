"use client";

import { create } from "zustand";
import { canSwitchOutlets, type UserRole } from "@/lib/auth/roles";
import {
  resolveActiveOutletId,
  type OutletLike,
} from "@/lib/outlets/resolve-default";

export type AuthSession = {
  userId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  outletId: string | null;
};

type AuthState = {
  session: AuthSession | null;
  activeOutletId: string | null;
  hydrated: boolean;
  setSession: (
    session: AuthSession | null,
    outlets?: OutletLike[]
  ) => void;
  setActiveOutletId: (outletId: string | null) => void;
  setHydrated: (hydrated: boolean) => void;
  clear: () => void;
};

const OUTLET_STORAGE_KEY = "hardwarepos_active_outlet";

function readStoredOutlet(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(OUTLET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredOutlet(outletId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (outletId) {
      localStorage.setItem(OUTLET_STORAGE_KEY, outletId);
    } else {
      localStorage.removeItem(OUTLET_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  activeOutletId: null,
  hydrated: false,
  setSession: (session, outlets) => {
    const stored = readStoredOutlet();
    const activeOutletId = session
      ? canSwitchOutlets(session.role)
        ? resolveActiveOutletId(outlets ?? [], {
            stored,
            profileOutletId: session.outletId,
          })
        : resolveActiveOutletId(outlets ?? [], {
            stored: null,
            profileOutletId: session.outletId,
          })
      : null;
    if (activeOutletId) {
      writeStoredOutlet(activeOutletId);
    }
    set({ session, activeOutletId });
  },
  setActiveOutletId: (outletId) => {
    const { session } = useAuthStore.getState();
    if (session && !canSwitchOutlets(session.role)) {
      const locked = session.outletId;
      if (locked && outletId && outletId !== locked) return;
    }
    writeStoredOutlet(outletId);
    set({ activeOutletId: outletId });
  },
  setHydrated: (hydrated) => set({ hydrated }),
  clear: () => {
    writeStoredOutlet(null);
    set({ session: null, activeOutletId: null, hydrated: true });
  },
}));

export function useOrganizationId(): string | null {
  return useAuthStore((s) => s.session?.organizationId ?? null);
}
