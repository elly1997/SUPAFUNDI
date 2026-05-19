import Link from "next/link";
import { ArrowRight, Package, ShoppingCart, Sun, Warehouse } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { getDashboardKpis } from "@/lib/actions/dashboard";
import { getSessionProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { canUsePos } from "@/lib/auth/roles";
import { formatTzs } from "@/lib/utils/currency";

export default async function DashboardHomePage() {
  const profile = await getSessionProfile();
  let kpis = {
    salesToday: 0,
    salesCountToday: 0,
    expensesToday: 0,
    netToday: 0,
  };
  try {
    kpis = await getDashboardKpis(profile?.outletId ?? undefined);
  } catch {
    /* show zeros */
  }

  return (
    <div className="app-page space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          profile?.fullName
            ? `Welcome back, ${profile.fullName}`
            : "Today’s overview for your hardware business"
        }
        actions={
          profile && canUsePos(profile.role) ? (
            <Link href="/pos" className={cn(buttonVariants(), "rounded-xl")}>
              Open POS
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Sales today"
          value={formatTzs(kpis.salesToday)}
          subtitle={`${kpis.salesCountToday} transactions`}
          variant="inflow"
          className="glass-card"
        />
        <KpiCard
          title="Expenses today"
          value={formatTzs(kpis.expensesToday)}
          subtitle="Recorded cash out"
          variant="outflow"
          className="glass-card"
        />
        <KpiCard
          title="Net today"
          value={formatTzs(kpis.netToday)}
          subtitle="Sales minus expenses"
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

      <Card className="glass-card border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sun className="size-5 text-primary" />
              Daily closing
            </CardTitle>
            <CardDescription>
              Reconcile drawer, sales, and expenses for the business date.
            </CardDescription>
          </div>
          <Link
            href="/daily-closing"
            className={cn(buttonVariants({ variant: "secondary" }), "rounded-xl")}
          >
            Open
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {profile && canUsePos(profile.role) && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="size-5 text-primary" />
                POS Terminal
              </CardTitle>
              <CardDescription>Fast counter sales</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/pos" className={cn(buttonVariants(), "rounded-xl")}>
                Open POS
              </Link>
            </CardContent>
          </Card>
        )}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="size-5" />
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href="/inventory/products"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}
            >
              Manage
            </Link>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Warehouse className="size-5" />
              Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href="/reports"
              className={cn(buttonVariants({ variant: "outline" }), "rounded-xl")}
            >
              Business reports
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
