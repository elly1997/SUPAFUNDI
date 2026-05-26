import type { DashboardKpis } from "@/lib/actions/dashboard";

export async function fetchDashboardKpis(params: {
  outletId?: string | null;
  businessDate: string;
}): Promise<DashboardKpis> {
  const q = new URLSearchParams({ businessDate: params.businessDate });
  if (params.outletId) q.set("outletId", params.outletId);
  const res = await fetch(`/api/dashboard/kpis?${q}`, {
    credentials: "include",
  });
  const body = (await res.json()) as {
    kpis?: DashboardKpis;
    error?: string;
  };
  if (!res.ok || !body.kpis) {
    throw new Error(body.error ?? "Failed to load dashboard KPIs");
  }
  return body.kpis;
}
