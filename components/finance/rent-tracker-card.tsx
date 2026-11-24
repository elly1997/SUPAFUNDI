"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRentSummary, saveRentSettings } from "@/lib/actions/rent";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en", {
    month: "short",
    year: "numeric",
  });
}

export function RentTrackerCard() {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [paymentsFrom, setPaymentsFrom] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rent-summary", outletId],
    queryFn: () => getRentSummary(outletId),
    enabled: !!outletId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!editOpen) return;
    setAmount(String(data?.settings?.monthlyAmount ?? ""));
    setStartMonth(data?.settings?.startMonth ?? new Date().toISOString().slice(0, 7));
    setPaymentsFrom(data?.settings?.paymentsFrom ?? `${new Date().toISOString().slice(0, 7)}-01`);
  }, [editOpen, data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveRentSettings({
        outletId,
        monthlyAmount: Number(amount),
        startMonth,
        paymentsFrom,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Rent tracker saved");
        setEditOpen(false);
        void queryClient.invalidateQueries({ queryKey: ["rent-summary"] });
      } else toast.error(r.message);
    },
  });

  if (!outletId || isLoading) return null;

  const owing = (data?.balance ?? 0) > 0;
  const ahead = (data?.balance ?? 0) < 0;

  return (
    <>
      <Card className={cn(owing && "border-warning/40")}>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Rent tracker</h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="mr-1.5 size-3.5" />
              {data?.configured ? "Edit" : "Set up"}
            </Button>
          </div>

          {!data?.configured || !data.settings ? (
            <p className="text-xs text-muted-foreground">
              Set the monthly rent for this outlet. Landlord part-payments and
              advances recorded under <strong>Rent</strong> are matched against it,
              oldest month first.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Due to date</p>
                  <p className="font-money text-sm font-semibold">{formatTzs(data.totalDue)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Paid</p>
                  <p className="font-money text-sm font-semibold text-outflow">
                    {formatTzs(data.totalPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {ahead ? "Paid ahead" : "Balance owed"}
                  </p>
                  <p
                    className={cn(
                      "font-money text-sm font-bold",
                      owing && "text-warning",
                      ahead && "text-inflow"
                    )}
                  >
                    {formatTzs(Math.abs(data.balance))}
                  </p>
                </div>
              </div>

              <ul className="space-y-1 text-xs">
                {data.months.map((m) => (
                  <li
                    key={m.month}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <span className="font-medium">{monthLabel(m.month)}</span>
                    <span className="font-money text-muted-foreground">
                      {formatTzs(m.paid)} /{" "}
                      {formatTzs(data.settings!.monthlyAmount)}
                      {m.balance > 0 ? (
                        <span className="ml-2 text-warning">owes {formatTzs(m.balance)}</span>
                      ) : m.due === 0 && m.paid > 0 ? (
                        <span className="ml-2 text-inflow">advance</span>
                      ) : (
                        <span className="ml-2 text-inflow">paid</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {data.payments.length > 0 ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {data.payments.length} landlord payment
                    {data.payments.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {data.payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {p.expense_date}
                          {p.description ? ` · ${p.description}` : ""}
                        </span>
                        <span className="font-money">{formatTzs(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rent tracker</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Monthly rent (TZS)</Label>
              <Input
                type="number"
                min={0}
                className="font-money"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>First month rent is due</Label>
              <Input
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Count rent payments made from</Label>
              <Input
                type="date"
                value={paymentsFrom}
                onChange={(e) => setPaymentsFrom(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Include payments made before the first month if they were for it.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => saveMut.mutate()}
              disabled={
                saveMut.isPending || !Number(amount) || !startMonth || !paymentsFrom
              }
            >
              {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
