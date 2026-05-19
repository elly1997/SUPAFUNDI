import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Banknote, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/ui/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function DailyClosingPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily closing"
        description="End-of-day sales, cash movement, expenses, and purchases for the selected outlet and date."
        actions={
          <Link href="/pos" className={cn(buttonVariants())}>
            Open POS
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Sales today"
          value="—"
          subtitle="Cash · M-Pesa · Credit (Phase 2)"
          icon={ShoppingCart}
          variant="inflow"
        />
        <KpiCard
          title="Cash in"
          value="—"
          subtitle="Collections & cash sales"
          icon={ArrowDownLeft}
          variant="inflow"
        />
        <KpiCard
          title="Cash out"
          value="—"
          subtitle="Expenses & purchases paid"
          icon={ArrowUpRight}
          variant="outflow"
        />
        <KpiCard
          title="Net movement"
          value="—"
          subtitle="In minus out"
          icon={Banknote}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 2</CardTitle>
          <CardDescription>
            Live figures from sales, expenses, GRNs, and cash sessions will appear
            here. Use the business date and outlet in the bar above to filter.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-inside list-disc space-y-1">
            <li>Cash drawer open / close and variance</li>
            <li>Drill-down tables for sales, expenses, purchases</li>
            <li>Printable Z-summary for the day</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
