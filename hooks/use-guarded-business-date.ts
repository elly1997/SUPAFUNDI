"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { fetchReconciledBusinessDates } from "@/lib/api/reconciled-dates-fetch";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

/** POS business date with reconciled days blocked from selection. */
export function useGuardedBusinessDate() {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const outletId = useAuthStore((s) => s.activeOutletId);

  const { data: reconciledDates = [] } = useQuery({
    queryKey: ["reconciled-business-dates", outletId],
    queryFn: () => fetchReconciledBusinessDates(outletId),
    staleTime: 60_000,
  });

  const reconciledSet = useMemo(
    () => new Set(reconciledDates),
    [reconciledDates]
  );

  const onBusinessDateChange = useCallback(
    (iso: string) => {
      if (reconciledSet.has(iso)) {
        toast.error(
          "This day is already reconciled. Choose another business date."
        );
        return;
      }
      setBusinessDate(iso);
    },
    [reconciledSet, setBusinessDate]
  );

  return {
    businessDate,
    onBusinessDateChange,
    reconciledDates,
    isCurrentDateReconciled: reconciledSet.has(businessDate),
  };
}
