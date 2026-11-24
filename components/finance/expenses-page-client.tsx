"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Building2,
  ChevronRight,
  Landmark,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CollectionAccountSelect } from "@/components/finance/collection-account-select";
import { EmployeeSelect } from "@/components/finance/employee-select";
import { RentTrackerCard } from "@/components/finance/rent-tracker-card";
import { isSalaryAdvanceCategory } from "@/lib/constants/expense-categories";
import { ExpenseVoidActions } from "@/components/finance/expense-void-actions";
import { PosExpenseCategorySelect } from "@/components/pos/pos-expense-category-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExpenseListRow } from "@/lib/actions/expenses";
import { fetchExpenses, recordExpenseApi } from "@/lib/api/daily-ops-fetch";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { needsCollectionAccount } from "@/lib/finance/collection-accounts";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { parseIsoDate, toIsoDate } from "@/lib/utils/iso-date";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type CategoryBucket = {
  id: string;
  label: string;
  total: number;
  count: number;
  items: ExpenseListRow[];
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  rent: Building2,
  utilities: Zap,
  wages: Users,
  salary_advance: Wallet,
  bank: Landmark,
  stock: Package,
  misc: MoreHorizontal,
};

function categoryIcon(id: string): LucideIcon {
  return CATEGORY_ICONS[id] ?? Banknote;
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function endOfMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function shiftMonth(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  d.setMonth(d.getMonth() + delta);
  return toIsoDate(d);
}

function rangeLabel(from: string, to: string): string {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const sameMonth =
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  if (sameMonth && from === startOfMonth(from) && to === endOfMonth(from)) {
    return a.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(a)} – ${fmt(b)}`;
}

export function ExpensesPageClient() {
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const outletId = useAuthStore((s) => s.activeOutletId);
  const queryClient = useQueryClient();

  const [fromDate, setFromDate] = useState(() => startOfMonth(businessDate));
  const [toDate, setToDate] = useState(() =>
    businessDate < endOfMonth(businessDate)
      ? businessDate
      : endOfMonth(businessDate)
  );
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("misc");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "mpesa" | "bank_transfer" | "on_account"
  >("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const isSalaryAdvance = isSalaryAdvanceCategory(category);

  const { data: expenses = [], isLoading, isFetching } = useQuery({
    queryKey: ["expenses", outletId, fromDate, toDate],
    queryFn: () =>
      fetchExpenses(2000, {
        outletId,
        fromDate,
        toDate,
      }),
    enabled: !!outletId,
  });

  const buckets = useMemo(() => {
    const map = new Map<string, CategoryBucket>();
    for (const e of expenses) {
      const id = (e.category ?? "misc").trim().toLowerCase() || "misc";
      const existing = map.get(id);
      if (existing) {
        existing.total += e.amount;
        existing.count += 1;
        existing.items.push(e);
      } else {
        map.set(id, {
          id,
          label: formatExpenseCategoryLabel(id),
          total: e.amount,
          count: 1,
          items: [e],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  const grandTotal = useMemo(
    () => buckets.reduce((s, b) => s + b.total, 0),
    [buckets]
  );

  const selectedBucket =
    selectedCategory == null
      ? null
      : buckets.find((b) => b.id === selectedCategory) ?? null;

  const applyThisMonth = () => {
    setFromDate(startOfMonth(businessDate));
    setToDate(
      businessDate < endOfMonth(businessDate)
        ? businessDate
        : endOfMonth(businessDate)
    );
    setSelectedCategory(null);
  };

  const applyLastMonth = () => {
    const ref = shiftMonth(businessDate, -1);
    setFromDate(startOfMonth(ref));
    setToDate(endOfMonth(ref));
    setSelectedCategory(null);
  };

  const applyLast3Months = () => {
    const start = startOfMonth(shiftMonth(businessDate, -2));
    setFromDate(start);
    setToDate(
      businessDate < endOfMonth(businessDate)
        ? businessDate
        : endOfMonth(businessDate)
    );
    setSelectedCategory(null);
  };

  const recordMut = useMutation({
    mutationFn: recordExpenseApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Expense recorded and posted to GL");
        setOpen(false);
        setAmount("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
        queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
        queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["payroll-run"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Expense failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={applyThisMonth}
            >
              This month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={applyLastMonth}
            >
              Last month
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={applyLast3Months}
            >
              Last 3 months
            </Button>
          </div>
          <DateRangePicker
            label="Expense period"
            from={fromDate}
            to={toDate}
            onFromChange={(v) => {
              setFromDate(v);
              setSelectedCategory(null);
            }}
            onToChange={(v) => {
              setToDate(v);
              setSelectedCategory(null);
            }}
          />
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" />
          Record expense
        </Button>
      </div>

      <RentTrackerCard />

      <KpiCard
        title={`Total · ${rangeLabel(fromDate, toDate)}`}
        value={formatTzs(grandTotal)}
        subtitle={
          isLoading
            ? "Loading…"
            : `${expenses.length} entr${expenses.length === 1 ? "y" : "ies"} · ${buckets.length} categor${buckets.length === 1 ? "y" : "ies"}`
        }
        icon={Wallet}
        variant="outflow"
        className={cn(isFetching && !isLoading && "opacity-80")}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : buckets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No expenses in this period. Record one or widen the date range.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {buckets.map((b) => {
            const Icon = categoryIcon(b.id);
            const selected = selectedCategory === b.id;
            const share =
              grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() =>
                  setSelectedCategory((cur) => (cur === b.id ? null : b.id))
                }
                className={cn(
                  "dash-stat-card group flex min-h-[7.5rem] flex-col rounded-xl border border-border bg-card p-3.5 text-left shadow-card transition-colors",
                  "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected && "border-primary/60 ring-2 ring-primary/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-outflow/10 text-outflow">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {b.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.count} entr{b.count === 1 ? "y" : "ies"} · {share}%
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className={cn(
                      "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                      selected && "rotate-90 text-primary"
                    )}
                  />
                </div>
                <p className="mt-auto pt-3 font-money text-xl font-semibold tabular-nums text-outflow sm:text-2xl">
                  {formatTzs(b.total)}
                </p>
                <p className="mt-0.5 text-[10px] font-medium text-primary">
                  {selected ? "Hide details" : "View entries"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {selectedBucket ? (
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{selectedBucket.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedBucket.count} entries · {formatTzs(selectedBucket.total)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                Clear
              </Button>
            </div>

            <div className="space-y-2 md:hidden">
              {selectedBucket.items.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-border bg-background/40 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {e.description?.trim() || "No description"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {e.expense_date}
                        {e.payment_method
                          ? ` · ${e.payment_method.replace(/_/g, " ")}`
                          : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-money text-sm font-semibold">
                      {formatTzs(e.amount)}
                    </p>
                  </div>
                  <div className="mt-2">
                    <ExpenseVoidActions
                      expenseId={e.id}
                      category={e.category}
                      description={e.description}
                      amount={e.amount}
                      expenseDate={e.expense_date}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="w-[100px] px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {selectedBucket.items.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {e.expense_date}
                      </td>
                      <td className="px-3 py-2">
                        {e.description?.trim() || "—"}
                      </td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">
                        {e.payment_method?.replace(/_/g, " ") ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-money font-medium">
                        {formatTzs(e.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <ExpenseVoidActions
                          expenseId={e.id}
                          category={e.category}
                          description={e.description}
                          amount={e.amount}
                          expenseDate={e.expense_date}
                          compact
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record expense</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Business date:{" "}
            <span className="font-medium text-foreground">{businessDate}</span>
            {outletId ? null : " · Select an outlet in the header"}
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <PosExpenseCategorySelect
                value={category}
                onValueChange={(v) => {
                  setCategory(v);
                  if (!isSalaryAdvanceCategory(v)) {
                    setEmployeeId("");
                  }
                }}
              />
            </div>
            {isSalaryAdvance ? (
              <EmployeeSelect
                value={employeeId}
                onChange={setEmployeeId}
                outletId={outletId}
              />
            ) : null}
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(
                    (v ?? "cash") as
                      | "cash"
                      | "mpesa"
                      | "bank_transfer"
                      | "on_account"
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash (drawer)</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="on_account">On account (AP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CollectionAccountSelect
              paymentMethod={paymentMethod}
              value={bankAccountId}
              onValueChange={setBankAccountId}
              label="Pay from account"
            />
            {needsCollectionAccount(paymentMethod) ? (
              <div className="space-y-2">
                <Label>Reference (optional)</Label>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="M-Pesa code, bank ref, etc."
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (needsCollectionAccount(paymentMethod) && !bankAccountId) {
                  toast.error(
                    "Select the bank or M-Pesa account for this payment"
                  );
                  return;
                }
                if (isSalaryAdvance && !employeeId) {
                  toast.error("Select the employee for this salary advance");
                  return;
                }
                recordMut.mutate({
                  category,
                  description,
                  amount: Number(amount),
                  paymentMethod,
                  bankAccountId: bankAccountId || undefined,
                  referenceNo: referenceNo.trim() || undefined,
                  expenseDate: businessDate,
                  outletId: outletId ?? undefined,
                  employeeId: employeeId || undefined,
                });
              }}
              disabled={
                recordMut.isPending ||
                !amount ||
                (isSalaryAdvance && !employeeId) ||
                (needsCollectionAccount(paymentMethod) && !bankAccountId)
              }
            >
              {recordMut.isPending ? "Saving…" : "Save & post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
