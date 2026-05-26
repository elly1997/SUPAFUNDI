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
import { DashboardKpisClient } from "@/components/dashboard/dashboard-kpis-client";
import { getSessionProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { canUsePos } from "@/lib/auth/roles";

export default async function DashboardHomePage() {
  const profile = await getSessionProfile();

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

      <DashboardKpisClient fallbackOutletId={profile?.outletId} />

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
