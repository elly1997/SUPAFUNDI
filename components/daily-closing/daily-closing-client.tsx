"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MessageCircle,
  Printer,
  Scale,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { KpiCard } from "@/components/ui/kpi-card";
import { CashSessionBar } from "@/components/pos/cash-session-bar";
import {
  buildClosingWhatsAppApi,
  fetchDayCashSummary,
  fetchUnreconciledDays,
  reconcileDailyClosingApi,
} from "@/lib/api/daily-ops-fetch";
import { formatClosingReportText } from "@/lib/utils/closing-report";
import {
  resolveActiveOutletId,
  resolveDefaultOutletId,
} from "@/lib/outlets/resolve-default";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type Props = {
  outlets: {
    id: string;
    name: string;
    code?: string | null;
    is_default?: boolean;
  }[];
};

export function DailyClosingClient({ outlets }: Props) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const setBusinessDate = useBusinessDateStore((s) => s.setBusinessDate);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const sessionOutletId = useAuthStore((s) => s.session?.outletId);
  const initialOutlet =
    resolveActiveOutletId(outlets, {
      stored: activeOutletId,
      profileOutletId: sessionOutletId,
    }) ??
    resolveDefaultOutletId(outlets) ??
    "";
  const [outletId, setOutletId] = useState(initialOutlet);
  const [countedClosing, setCountedClosing] = useState("");
  const [openingOverride, setOpeningOverride] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const date = searchParams.get("date");
    const counted = searchParams.get("counted");
    const outlet = searchParams.get("outlet");
    if (date) setBusinessDate(date);
    if (counted) setCountedClosing(counted);
    if (outlet && outlets.some((o) => o.id === outlet)) {
      setOutletId(outlet);
    }
  }, [searchParams, setBusinessDate, outlets]);

  const effectiveOutlet =
    outletId || resolveDefaultOutletId(outlets) || undefined;

  const { data: summary, isLoading } = useQuery({
    queryKey: ["day-cash-summary", effectiveOutlet, businessDate],
    queryFn: () => fetchDayCashSummary(effectiveOutlet!, businessDate),
    enabled: !!effectiveOutlet,
  });

  const { data: unreconciled = [] } = useQuery({
    queryKey: ["unreconciled-days", effectiveOutlet],
    queryFn: () => fetchUnreconciledDays(effectiveOutlet, 30),
    enabled: !!effectiveOutlet,
  });

  const reportText = useMemo(() => {
    if (!summary) return "";
    return formatClosingReportText({
      outletName: summary.outletName,
      businessDate: summary.businessDate,
      openingBalance: summary.openingBalance,
      cashSales: summary.cashSales,
      mpesaSales: summary.mpesaSales,
      cashExpenses: summary.cashExpenses,
      cashPurchases: summary.cashPurchases,
      cashSupplierPayments: summary.cashSupplierPayments,
      cashCustomerPayments: summary.cashCustomerPayments,
      cashCustomerDeposits: summary.cashCustomerDeposits,
      bankDeposits: summary.bankDeposits,
      expectedCash: summary.expectedCash,
      closingBalance: summary.closingBalance,
      variance: summary.variance,
      status: summary.status,
      reconciledAt: summary.reconciledAt,
    });
  }, [summary]);

  const reconcileMut = useMutation({
    mutationFn: async () => {
      if (!effectiveOutlet) throw new Error("Select an outlet");
      const counted = Number(countedClosing);
      if (!Number.isFinite(counted) || counted < 0) {
        throw new Error("Enter counted closing cash");
      }
      return reconcileDailyClosingApi({
        outletId: effectiveOutlet,
        businessDate,
        countedClosing: counted,
        openingBalance: openingOverride.trim()
          ? Number(openingOverride)
          : undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Day reconciled");
        setCountedClosing("");
        void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["unreconciled-days"] });
        void queryClient.invalidateQueries({
          queryKey: ["reconciled-business-dates"],
        });
        void queryClient.invalidateQueries({ queryKey: ["drawer-status"] });
        void queryClient.invalidateQueries({ queryKey: ["catch-up-days"] });
        void queryClient.invalidateQueries({ queryKey: ["reports"] });
      } else toast.error(r.message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const whatsappMut = useMutation({
    mutationFn: async () => {
      if (!effectiveOutlet) throw new Error("Select an outlet");
      return buildClosingWhatsAppApi(effectiveOutlet, businessDate);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "WhatsApp failed"),
    onSuccess: async (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      if (r.whatsappUrl) {
        window.open(r.whatsappUrl, "_blank", "noopener,noreferrer");
        toast.success("Opening WhatsApp for director");
      } else {
        try {
          await navigator.clipboard.writeText(r.message);
          toast.message(
            "Report copied — add director phone in Settings → General"
          );
        } catch {
          toast.message(r.message.slice(0, 120) + "…");
        }
      }
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label>Outlet</Label>
          <select
            className="flex h-9 min-w-[12rem] rounded-lg border border-input bg-background px-3 text-sm"
            value={effectiveOutlet}
            onChange={(e) => setOutletId(e.target.value)}
            aria-label="Outlet for daily closing"
          >
            {outlets.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <DatePicker
          label="Business date to reconcile"
          value={businessDate}
          onChange={setBusinessDate}
          showPresets
        />
      </div>

      {effectiveOutlet ? (
        <Card className="border-border/80">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Open today&apos;s cash drawer before POS sales, or close when the
              shift ends.
            </p>
            <CashSessionBar
              outletId={effectiveOutlet}
              variant="inline"
              redirectAfterOpen="/pos"
            />
          </CardContent>
        </Card>
      ) : null}

      {isLoading || !summary ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading day summary…
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Opening cash"
              value={formatTzs(summary.openingBalance)}
              icon={Scale}
            />
            <KpiCard
              title="Expected closing"
              value={formatTzs(summary.expectedCash)}
              subtitle="Cash drawer only (cash sales + customer cash − cash outs). M-Pesa does not change this."
              variant="inflow"
            />
            <KpiCard
              title="Cash sales"
              value={formatTzs(summary.cashSales)}
              subtitle={`M-Pesa ${formatTzs(summary.mpesaSales)} (not in expected cash)`}
            />
            <KpiCard
              title="Cash out"
              value={formatTzs(
                summary.cashExpenses +
                  summary.bankDeposits +
                  summary.cashPurchases +
                  summary.cashSupplierPayments
              )}
              subtitle={`GRN ${formatTzs(summary.cashPurchases)} · Suppliers ${formatTzs(summary.cashSupplierPayments)}`}
              variant="outflow"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Reconcile this day</CardTitle>
                <CardDescription>
                  Count physical cash in the drawer. Prior day&apos;s reconciled
                  closing becomes today&apos;s opening (unless you override).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    reconcileMut.mutate();
                  }}
                >
                <div className="space-y-1">
                  <Label>Opening override (optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={String(summary.openingBalance)}
                    value={openingOverride}
                    onChange={(e) => setOpeningOverride(e.target.value)}
                    className="font-money"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Counted closing cash (TZS)</Label>
                  <Input
                    type="number"
                    min={0}
                    required
                    value={countedClosing}
                    onChange={(e) => setCountedClosing(e.target.value)}
                    className="font-money text-lg"
                    placeholder={String(Math.round(summary.expectedCash))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Variance reason, handover, etc."
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    className="btn-reconcile"
                    disabled={reconcileMut.isPending || !countedClosing.trim()}
                  >
                    {reconcileMut.isPending && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Mark reconciled
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={whatsappMut.isPending}
                    onClick={() => whatsappMut.mutate()}
                  >
                    <MessageCircle className="mr-2 size-4" />
                    Send via WhatsApp
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const w = window.open("", "_blank");
                      if (w) {
                        w.document.write(
                          `<pre style="font-family:monospace;padding:16px">${reportText}</pre>`
                        );
                        w.print();
                      }
                    }}
                  >
                    <Printer className="mr-2 size-4" />
                    Print
                  </Button>
                </div>
                </form>
                {summary.status === "reconciled" && summary.closingBalance != null ? (
                  <p className="text-sm text-inflow">
                    Reconciled · closing {formatTzs(summary.closingBalance)}
                    {summary.variance != null && summary.variance !== 0
                      ? ` · variance ${formatTzs(summary.variance)}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-sm text-warning">Not reconciled yet</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Director report preview</CardTitle>
                <CardDescription>
                  Share on WhatsApp (uses organization phone from Settings, or
                  setting key <code className="text-xs">director_whatsapp</code>
                  ).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
                  {reportText}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Unreconciled days</CardTitle>
          <CardDescription>
            Days with sales or expenses that are not reconciled. Reports can
            exclude these until closed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {unreconciled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              All recent days with activity are reconciled.
            </p>
          ) : (
            <ul className="space-y-2">
              {unreconciled.map((d) => (
                <li
                  key={`${d.outletId}-${d.businessDate}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    <strong>{d.businessDate}</strong> · {d.outletName}
                  </span>
                  <span className="font-money text-muted-foreground">
                    Expected {formatTzs(d.expectedCash)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOutletId(d.outletId);
                      setBusinessDate(d.businessDate);
                    }}
                  >
                    Reconcile
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
