"use client";

import { format, subMonths } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_EXPORT_TYPES,
  type BusinessExportType,
} from "@/lib/backup/business-export-types";
import { downloadBusinessCsv } from "@/lib/api/backup-fetch";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { useQuery } from "@tanstack/react-query";

function defaultFromDate() {
  return format(subMonths(new Date(), 12), "yyyy-MM-dd");
}

function defaultToDate() {
  return format(new Date(), "yyyy-MM-dd");
}

export function BusinessDataExportPanel() {
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [outletId, setOutletId] = useState("");
  const [exporting, setExporting] = useState<BusinessExportType | "all" | null>(
    null
  );

  const { data: outlets = [] } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });
  const effectiveOutletId = outletId || resolveDefaultOutletId(outlets) || "";

  const runExport = useCallback(
    async (type: BusinessExportType) => {
      setExporting(type);
      try {
        await downloadBusinessCsv({
          type,
          fromDate,
          toDate,
          outletId: effectiveOutletId || null,
        });
        toast.success(`Downloaded ${type.replace("_", " ")} CSV`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed");
      } finally {
        setExporting(null);
      }
    },
    [fromDate, toDate, effectiveOutletId]
  );

  const exportAll = useCallback(async () => {
    setExporting("all");
    try {
      for (const t of BUSINESS_EXPORT_TYPES) {
        await downloadBusinessCsv({
          type: t.id,
          fromDate,
          toDate,
          outletId: effectiveOutletId || null,
        });
        await new Promise((r) => setTimeout(r, 400));
      }
      toast.success("All business archives downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }, [fromDate, toDate, effectiveOutletId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business data export (archive)</CardTitle>
        <CardDescription>
          Download CSV files for accountants, auditors, or offline records.
          These are read-only exports — not for automatic restore into the
          system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="space-y-2">
            <Label>Date range (sales, payments, expenses, GL)</Label>
            <DateRangePicker
              label="Export period"
              from={fromDate}
              to={toDate}
              onFromChange={setFromDate}
              onToChange={setToDate}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-outlet">Outlet filter (optional)</Label>
            <select
              id="export-outlet"
              className="flex h-10 w-full min-w-[12rem] rounded-lg border border-input bg-background px-3 text-sm"
              value={effectiveOutletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              <option value="">All outlets</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {BUSINESS_EXPORT_TYPES.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.description}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={exporting !== null}
                onClick={() => void runExport(t.id)}
              >
                {exporting === t.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={exporting !== null}
          onClick={() => void exportAll()}
        >
          {exporting === "all" ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Download className="mr-2 size-4" />
          )}
          Download all CSV archives
        </Button>
      </CardContent>
    </Card>
  );
}
