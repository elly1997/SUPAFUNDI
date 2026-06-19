"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { fetchDashboardKpis } from "@/lib/api/dashboard-fetch";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  fallbackOutletId?: string | null;
};

export function DashboardKpisClient({ fallbackOutletId }: Props) {
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const outletId = activeOutletId ?? fallbackOutletId ?? null;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dashboard-kpis", outletId, businessDate],
    queryFn: () => fetchDashboardKpis({ outletId, businessDate }),
    staleTime: 90_000,
    refetchOnWindowFocus: false,
  });

  const kpis = data ?? {
    salesToday: 0,
    salesCountToday: 0,
    expensesToday: 0,
    netToday: 0,
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Business date: {businessDate}</span>
        {(isLoading || isFetching) && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Updating
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Sales"
          value={formatTzs(kpis.salesToday)}
          subtitle={`${kpis.salesCountToday} tx · ${businessDate}`}
          variant="inflow"
          className="glass-card"
        />
        <KpiCard
          title="Expenses"
          value={formatTzs(kpis.expensesToday)}
          subtitle={`Cash out · ${businessDate}`}
          variant="outflow"
          className="glass-card"
        />
        <KpiCard
          title="Net"
          value={formatTzs(kpis.netToday)}
          subtitle={`Sales − expenses · ${businessDate}`}
          variant={kpis.netToday >= 0 ? "inflow" : "outflow"}
          className="glass-card"
        />
        <Link href="/reports" className="block">
          <KpiCard
            title="Reports"
            value="View"
            subtitle="Trends, top products, alerts"
            className="glass-card transition-transform hover:scale-[1.02]"
          />
        </Link>
      </div>
    </div>
  );
}
