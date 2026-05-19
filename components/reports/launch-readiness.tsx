"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  Database,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import {
  LAUNCH_CHECKLIST,
  getLaunchSummary,
  type LaunchItemStatus,
} from "@/lib/accounting/launch-checklist";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  LaunchItemStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  done: {
    label: "Done",
    icon: CheckCircle2,
    className: "text-inflow",
  },
  partial: {
    label: "Partial",
    icon: CircleDot,
    className: "text-warning",
  },
  missing: {
    label: "Missing",
    icon: Circle,
    className: "text-destructive",
  },
  schema_only: {
    label: "Schema only",
    icon: Database,
    className: "text-muted-foreground",
  },
};

export function LaunchReadiness() {
  const summary = getLaunchSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Launch readiness
        </h1>
        <p className="text-sm text-muted-foreground">
          Compared to QuickBooks-style retail + bookkeeping. Use this as your
          go-live checklist.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall progress</CardDescription>
            <CardTitle className="text-3xl">{summary.percentComplete}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Launch blockers open</CardDescription>
            <CardTitle
              className={cn(
                "text-3xl",
                summary.blockerOpen > 0 ? "text-destructive" : "text-inflow"
              )}
            >
              {summary.blockerOpen}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Modules complete</CardDescription>
            <CardTitle className="text-3xl">{summary.done}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Soft launch ready?</CardDescription>
            <CardTitle className="text-lg">
              {summary.readyForSoftLaunch ? "Yes" : "Not yet"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {!summary.readyForSoftLaunch && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="flex flex-row items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 text-amber-600" />
            <div>
              <CardTitle className="text-base">Before production launch</CardTitle>
              <CardDescription className="mt-1 text-foreground/80">
                Resolve launch blockers below — especially POS, GL posting from
                sales, inventory movements, AR, and core financial reports.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>QuickBooks parity matrix</CardTitle>
          <CardDescription>
            What QuickBooks does vs what HardwarePOS has today
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">Area</th>
                <th className="pb-2 pr-4 font-medium">QuickBooks</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {LAUNCH_CHECKLIST.map((item) => {
                const meta = STATUS_META[item.status];
                const Icon = meta.icon;
                return (
                  <tr key={item.id} className="border-b border-border/60">
                    <td className="py-3 pr-4 font-medium">
                      {item.area}
                      {item.launchBlocker && (
                        <span className="ml-2 text-xs text-destructive">
                          blocker
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {item.quickBooksFeature}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          meta.className
                        )}
                      >
                        <Icon className="size-4" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground">{item.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounting & bookkeeping flow</CardTitle>
          <CardDescription>
            Double-entry rules (debits must equal credits) — aligned with
            QuickBooks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <FlowBlock
            title="1. Cash / M-Pesa sale (retail)"
            lines={[
              "Dr Cash or M-Pesa (asset)",
              "Cr Sales Revenue (income)",
              "Cr VAT Output 18% (liability)",
              "Dr COGS / Cr Inventory (when stock issues)",
            ]}
          />
          <FlowBlock
            title="2. Credit sale (trade account)"
            lines={[
              "Dr Accounts Receivable",
              "Cr Sales Revenue + VAT Output",
              "credit_ledger: invoice row + customer balance",
              "On payment: Dr Cash, Cr AR",
            ]}
          />
          <FlowBlock
            title="3. Receive inventory (GRN)"
            lines={[
              "Dr Inventory Asset (+ VAT Input if applicable)",
              "Cr Accounts Payable (on account) or Cash",
              "stock_movements: purchase / transfer_in",
            ]}
          />
          <FlowBlock
            title="4. Pay supplier bill"
            lines={[
              "Dr Accounts Payable",
              "Cr Bank or Cash",
              "supplier_payments linked to supplier_bills",
            ]}
          />
          <FlowBlock
            title="5. Expense (rent, utilities)"
            lines={[
              "Dr Expense account (6xxx)",
              "Cr Cash (paid now) or AP (accrued)",
            ]}
          />
          <p className="text-muted-foreground">
            Rules are implemented in{" "}
            <code className="text-xs">lib/accounting/posting-rules.ts</code>.
            Automatic posting hooks fire when POS, GRN, and expense UIs are
            completed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended launch phases</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <Phase
            name="Phase A — Pilot (2–4 weeks)"
            items={[
              "POS + cash/M-Pesa checkout",
              "Auto journal on completed sale",
              "Products + stock view",
              "Daily sales summary",
            ]}
          />
          <Phase
            name="Phase B — Accounting (4–6 weeks)"
            items={[
              "AR aging + customer statements",
              "GRN + PO receiving",
              "Trial Balance + P&L",
              "VAT report (TRA-ready export)",
            ]}
          />
          <Phase
            name="Phase C — Scale"
            items={[
              "M-Pesa live + bank reconcile",
              "Multi-outlet transfers",
              "Period close + audit log",
              "Offline POS sync",
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/inventory/products" className={cn(buttonVariants())}>
          Products
        </Link>
        <Link
          href="/pos"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          POS (in progress)
        </Link>
      </div>
    </div>
  );
}

function FlowBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="font-medium">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}

function Phase({ name, items }: { name: string; items: string[] }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="font-medium">{name}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

