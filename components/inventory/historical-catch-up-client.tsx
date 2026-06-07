"use client";

import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import {
  Banknote,
  CheckCircle2,
  Circle,
  Loader2,
  PackagePlus,
  Receipt,
  ShoppingCart,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CatchUpDayRow, CatchUpDayStatus } from "@/lib/actions/catch-up";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { fetchCatchUpDays } from "@/lib/api/catch-up-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { parseIsoDate, todayIso } from "@/lib/utils/iso-date";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

const OPENING_IMPORT_DATE = "2026-05-11";

const statusLabel: Record<CatchUpDayStatus, string> = {
  reconciled: "Reconciled",
  ready_to_reconcile: "Ready to reconcile",
  needs_sales: "Enter sales",
  needs_purchases: "Enter purchases",
  empty: "No activity yet",
};

const statusClass: Record<CatchUpDayStatus, string> = {
  reconciled: "bg-inflow-muted text-inflow",
  ready_to_reconcile: "bg-primary/15 text-primary",
  needs_sales: "bg-warning-muted text-warning",
  needs_purchases: "bg-warning-muted text-warning",
  empty: "bg-muted text-muted-foreground",
};

type ZNotes = {
  expectedSales?: string;
  deliveryNoteCount?: string;
};

function storageKey(outletId: string, date: string) {
  return `catch-up-notes-${outletId}-${date}`;
}

function loadZNotes(outletId: string, date: string): ZNotes {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(storageKey(outletId, date));
    return raw ? (JSON.parse(raw) as ZNotes) : {};
  } catch {
    return {};
  }
}

function saveZNotes(outletId: string, date: string, notes: ZNotes) {
  localStorage.setItem(storageKey(outletId, date), JSON.stringify(notes));
}

export function HistoricalCatchUpClient() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const businessDate = useBusinessDateStore((s) => s.businessDate);

  const defaultFrom = format(
    subDays(parseIsoDate(OPENING_IMPORT_DATE), -1),
    "yyyy-MM-dd"
  );
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(() =>
    format(subDays(parseIsoDate(todayIso()), 1), "yyyy-MM-dd")
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [zNotes, setZNotes] = useState<ZNotes>({});

  const { data: days = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["catch-up-days", outletId, fromDate, toDate],
    queryFn: () => fetchCatchUpDays(outletId!, fromDate, toDate),
    enabled: !!outletId,
  });

  const selected = useMemo(
    () => days.find((d) => d.businessDate === selectedDate) ?? null,
    [days, selectedDate]
  );

  useEffect(() => {
    if (!outletId || !selectedDate) return;
    setZNotes(loadZNotes(outletId, selectedDate));
  }, [outletId, selectedDate]);

  const pickDay = (row: CatchUpDayRow) => {
    setSelectedDate(row.businessDate);
    setBusinessDate(row.businessDate);
    toast.message(`Business date set to ${row.businessDate}`);
  };

  const persistZNotes = (patch: Partial<ZNotes>) => {
    if (!outletId || !selectedDate) return;
    const next = { ...zNotes, ...patch };
    setZNotes(next);
    saveZNotes(outletId, selectedDate, next);
  };

  const expectedSales = Number(zNotes.expectedSales);
  const salesDiff =
    selected && Number.isFinite(expectedSales) && expectedSales > 0
      ? roundDiff(selected.salesTotal - expectedSales)
      : null;

  const progress = useMemo(() => {
    const total = days.length;
    const reconciled = days.filter((d) => d.reconciled).length;
    return { total, reconciled };
  }, [days]);

  if (!outletId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an active outlet in the header to backfill purchases and sales.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How to backfill (no recount)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Opening stock is from import on{" "}
            <strong className="text-foreground">{OPENING_IMPORT_DATE}</strong>.
            Work <strong className="text-foreground">oldest day → newest</strong>.
            Each day: delivery notes first, then Z-report / ticket sales, then
            reconcile.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Select a day in the table (sets business date).</li>
            <li>
              <strong className="text-foreground">Receive goods</strong> — every
              delivery note for that date.
            </li>
            <li>
              <strong className="text-foreground">POS</strong> — every sale for
              that date (cash, M-Pesa, credit).
            </li>
            <li>
              Compare system sales total to your Z-report (optional fields).
            </li>
            <li>
              <strong className="text-foreground">Open drawer</strong> with prior
              day&apos;s reconciled closing as opening float.
            </li>
            <li>
              <strong className="text-foreground">Close drawer</strong> then{" "}
              <strong className="text-foreground">reconcile</strong> — same
              numbers as daily closing / director report.
            </li>
          </ol>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="catch-up-from">From</Label>
          <Input
            id="catch-up-from"
            type="date"
            className="h-9 w-40"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="catch-up-to">To</Label>
          <Input
            id="catch-up-to"
            type="date"
            className="h-9 w-40"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-9"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Refresh"
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          {progress.reconciled} / {progress.total} days reconciled
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(18rem,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Day-by-day progress</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-8 animate-spin" />
              </div>
            ) : days.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No days in range. Adjust from/to dates.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">GRNs</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((d) => (
                    <TableRow
                      key={d.businessDate}
                      className={cn(
                        "cursor-pointer",
                        selectedDate === d.businessDate && "bg-primary/10"
                      )}
                      onClick={() => pickDay(d)}
                    >
                      <TableCell className="font-medium">
                        {d.businessDate}
                        {businessDate === d.businessDate ? (
                          <span className="ml-2 text-xs text-primary">
                            active
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-money text-xs">
                        {d.grnCount} · {formatTzs(d.grnTotal)}
                      </TableCell>
                      <TableCell className="text-right font-money text-xs">
                        {d.salesCount} · {formatTzs(d.salesTotal)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            statusClass[d.status]
                          )}
                        >
                          {statusLabel[d.status]}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedDate ? `Work on ${selectedDate}` : "Select a day"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">
                Click a row to set the business date and open the checklist.
              </p>
            ) : (
              <>
                <CatchUpStep
                  done={selected.grnCount > 0}
                  label={`Purchases (${selected.grnCount} GRN · ${formatTzs(selected.grnTotal)})`}
                  href="/inventory/receive"
                />
                <CatchUpStep
                  done={selected.salesCount > 0}
                  label={`Sales (${selected.salesCount} · ${formatTzs(selected.salesTotal)})`}
                  href="/pos"
                />
                <CatchUpStep
                  done={
                    selected.drawerStatus === "closed" || selected.reconciled
                  }
                  label={`Close drawer (expected ${formatTzs(selected.expectedCash)})`}
                  href="/pos"
                />
                <CatchUpStep
                  done={selected.reconciled}
                  label="Daily reconcile"
                  href="/daily-closing"
                />

                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                    <Banknote className="size-3.5" />
                    Cash drawer
                  </p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Suggested open</dt>
                    <dd className="text-right font-money">
                      {formatTzs(selected.suggestedOpening)}
                    </dd>
                    <dt className="text-muted-foreground">Live expected</dt>
                    <dd className="text-right font-money text-inflow">
                      {formatTzs(selected.expectedCash)}
                    </dd>
                    {selected.reconciledClosing != null ? (
                      <>
                        <dt className="text-muted-foreground">Reconciled close</dt>
                        <dd className="text-right font-money">
                          {formatTzs(selected.reconciledClosing)}
                        </dd>
                      </>
                    ) : null}
                    {selected.sessionVariance != null &&
                    selected.sessionVariance !== 0 ? (
                      <>
                        <dt className="text-muted-foreground">Session variance</dt>
                        <dd className="text-right font-money text-warning">
                          {formatTzs(selected.sessionVariance)}
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {outletId ? (
                    <CashSessionBar outletId={outletId} variant="inline" />
                  ) : null}
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Z-report check (optional)
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="z-sales" className="text-xs">
                      Expected sales total (TZS)
                    </Label>
                    <Input
                      id="z-sales"
                      type="number"
                      min={0}
                      className="h-9 font-money"
                      placeholder="From Z-report"
                      value={zNotes.expectedSales ?? ""}
                      onChange={(e) =>
                        persistZNotes({ expectedSales: e.target.value })
                      }
                    />
                  </div>
                  {salesDiff != null ? (
                    <p
                      className={cn(
                        "text-sm font-money",
                        Math.abs(salesDiff) < 1
                          ? "text-inflow"
                          : "text-warning"
                      )}
                    >
                      {Math.abs(salesDiff) < 1
                        ? "Matches system sales total"
                        : `Difference vs system: ${salesDiff > 0 ? "+" : ""}${formatTzs(salesDiff)}`}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    <Label htmlFor="z-grns" className="text-xs">
                      Delivery notes count
                    </Label>
                    <Input
                      id="z-grns"
                      type="number"
                      min={0}
                      step={1}
                      className="h-9"
                      placeholder="How many deliveries?"
                      value={zNotes.deliveryNoteCount ?? ""}
                      onChange={(e) =>
                        persistZNotes({ deliveryNoteCount: e.target.value })
                      }
                    />
                  </div>
                  {zNotes.deliveryNoteCount &&
                  Number(zNotes.deliveryNoteCount) !== selected.grnCount ? (
                    <p className="text-xs text-warning">
                      System has {selected.grnCount} GRN(s) — check missing
                      receives.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href={`/sales?from=${selected.businessDate}&to=${selected.businessDate}`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    <Receipt className="mr-2 size-4" />
                    Sales for this day
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function roundDiff(n: number) {
  return Math.round(n * 100) / 100;
}

function CatchUpStep({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
    >
      {done ? (
        <CheckCircle2 className="size-5 shrink-0 text-inflow" />
      ) : (
        <Circle className="size-5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      {href.includes("receive") ? (
        <PackagePlus className="size-4 shrink-0 opacity-60" />
      ) : href.includes("pos") ? (
        <ShoppingCart className="size-4 shrink-0 opacity-60" />
      ) : (
        <Sun className="size-4 shrink-0 opacity-60" />
      )}
    </Link>
  );
}
