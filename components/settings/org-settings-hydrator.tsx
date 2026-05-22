"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useOrgSettingsStore } from "@/stores/orgSettingsStore";

export function OrgSettingsHydrator({ children }: { children: React.ReactNode }) {
  const setOrgSettings = useOrgSettingsStore((s) => s.setOrgSettings);

  const { data } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/org", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load org settings");
      return res.json() as Promise<{
        vatEnabled: boolean;
        defaultVatRate: number;
      }>;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) {
      setOrgSettings({
        vatEnabled: data.vatEnabled,
        defaultVatRate: data.defaultVatRate,
      });
    }
  }, [data, setOrgSettings]);

  return <>{children}</>;
}
