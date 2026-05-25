"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ExternalLink, Landmark, Loader2, TrendingDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PosExpenseCategorySelect } from "@/components/pos/pos-expense-category-select";
import { PosRecordDate } from "@/components/pos/pos-record-date";
import {
  fetchExpenses,
  receiveGoodsApi,
  recordExpenseApi,
} from "@/lib/api/daily-ops-fetch";
import {
  fetchBankTransactions,
  recordCashDepositApi,
} from "@/lib/api/banking-fetch";
import { PosBankDepositAccountPicker } from "@/components/pos/pos-payment-account-picker";
import {
  createSupplierApi,
  fetchSupplierOptions,
  invalidateSupplierQueries,
} from "@/lib/api/suppliers-fetch";
import { cn } from "@/lib/utils";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { formatTzs } from "@/lib/utils/currency";
import { useTaxRate } from "@/hooks/useTaxRate";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import type { PosProductRow } from "@/hooks/usePosProducts";

const EXPENSE_PRESETS = [
  { label: "Tea / lunch", category: "misc", amount: 5000 },
  { label: "Transport", category: "misc", amount: 10000 },
  { label: "Airtime", category: "utilities", amount: 5000 },
  { label: "Fuel", category: "misc", amount: 20000 },
] as const;

type Tab = "expense" | "deposit" | "stock";

type Props = {
  outletId: string;
  products: PosProductRow[];
  className?: string;
};

export function PosCashflowPanel({ outletId, products, className }: Props) {
  const taxRate = useTaxRate();
  const [tab, setTab] = useState<Tab>("expense");
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const [category, setCategory] = useState<string>("misc");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [stockQty, setStockQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [paidCash, setPaidCash] = useState(true);
  const [newSupplier, setNewSupplier] = useState("");
  const [stickySupplierName, setStickySupplierName] = useState("");
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["pos-expenses", outletId, businessDate],
    queryFn: () =>
      fetchExpenses(80, {
        outletId,
        fromDate: businessDate,
        toDate: businessDate,
      }),
  });

  const { data: bankTransactions = [], isLoading: depositsLoading } = useQuery({
    queryKey: ["pos-bank-deposits", outletId, businessDate],
    queryFn: () => fetchBankTransactions(null, outletId),
    staleTime: 30_000,
  });

  const dayDeposits = bankTransactions.filter(
    (t) =>
      t.transaction_type === "deposit" &&
      t.transaction_date === businessDate &&
      (t.outlet_id === outletId || t.outlet_id == null) &&
      (t.description?.startsWith("Cash drawer deposit") ?? false)
  );

  const {
    data: suppliers = [],
    refetch: refetchSuppliers,
    isError: suppliersError,
    error: suppliersLoadError,
  } = useQuery({
    queryKey: ["pos-suppliers"],
    queryFn: fetchSupplierOptions,
    staleTime: 30_000,
  });

  const addSupplierMut = useMutation({
    mutationFn: (name: string) => createSupplierApi({ name }),
    onSuccess: (r) => {
      if (r.ok) {
        const name = newSupplier.trim();
        setSupplierId(r.id);
        setStickySupplierName(name);
        setNewSupplier("");
        toast.success("Supplier added");
        void refetchSuppliers();
        invalidateSupplierQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not add supplier"),
  });

  const dayExpenses = expenses.filter(
    (e) =>
      e.expense_date === businessDate &&
      (e.category ?? "").toLowerCase() !== "bank"
  );
  const dayTotal = dayExpenses.reduce((s, e) => s + e.amount, 0);

  const recordMut = useMutation({
    mutationFn: recordExpenseApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Expense recorded");
        setAmount("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-expenses"] });
        queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Expense failed"),
  });

  const depositMut = useMutation({
    mutationFn: recordCashDepositApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Cash deposited to bank");
        setAmount("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-bank-deposits"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
        queryClient.invalidateQueries({ queryKey: ["cash-deposit-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Deposit failed"),
  });

  const stockMut = useMutation({
    mutationFn: receiveGoodsApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Stock purchase recorded");
        setStockQty("1");
        setUnitCost("");
        setProductId("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-products"] });
        queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Purchase failed"),
  });

  const selectedProduct = products.find((p) => p.id === productId);

  return (
    <aside
      className={cn(
        "flex min-h-0 w-full min-w-[12rem] flex-col border-r border-border bg-card/40",
        className
      )}
    >
      <div className="shrink-0 border-b border-border bg-header/60 px-3 py-3">
        <div className="flex items-center gap-2">
          <TrendingDown className="size-5 shrink-0 text-outflow" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Cash out</h2>
            <p className="truncate font-money text-xs text-muted-foreground">
              {businessDate} · {formatTzs(dayTotal)} expenses
            </p>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-border px-2 py-2">
        <PosRecordDate />
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border p-2">
        <button
          type="button"
          onClick={() => setTab("expense")}
          className={cn(
            "min-h-11 rounded-lg px-2 py-2 text-[11px] font-semibold touch-manipulation",
            tab === "expense"
              ? "bg-outflow/15 text-outflow"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setTab("deposit")}
          className={cn(
            "min-h-11 rounded-lg px-2 py-2 text-[11px] font-semibold touch-manipulation",
            tab === "deposit"
              ? "bg-info/15 text-info"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          To bank
        </button>
        <button
          type="button"
          onClick={() => setTab("stock")}
          className={cn(
            "min-h-11 rounded-lg px-2 py-2 text-[11px] font-semibold touch-manipulation",
            tab === "stock"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          Stock buy
        </button>
      </div>

      <div className="pos-scroll-area min-h-0 flex-1 p-3">
        {tab === "expense" ? (
          <div className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(amount);
                if (!amt || amt <= 0) {
                  toast.error("Enter a valid amount");
                  return;
                }
                recordMut.mutate({
                  outletId,
                  category,
                  description: description || undefined,
                  amount: amt,
                  paidFromCash: true,
                  expenseDate: businessDate,
                });
              }}
            >
              <div className="flex flex-wrap gap-1.5">
                {EXPENSE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="min-h-10 rounded-full border border-border bg-muted/40 px-3 py-2 text-[11px] font-medium text-foreground hover:border-primary/40 touch-manipulation"
                    onClick={() => {
                      setCategory(p.category);
                      setAmount(String(p.amount));
                      setDescription(p.label);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <PosExpenseCategorySelect
                  value={category}
                  onValueChange={setCategory}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount (TZS)</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-10 rounded-lg font-money text-foreground"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  className="min-h-11 rounded-lg text-foreground"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full rounded-xl bg-outflow hover:bg-outflow/90"
                disabled={recordMut.isPending}
              >
                {recordMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Record expense"
                )}
              </Button>
            </form>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Recorded on {businessDate}
              </p>
              {expensesLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : dayExpenses.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No expenses on this date
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dayExpenses.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {formatExpenseCategoryLabel(e.category ?? "misc")}
                        </span>
                        <span className="shrink-0 font-money font-bold text-outflow">
                          {formatTzs(e.amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {e.expense_date}
                        {e.description ? ` · ${e.description}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : tab === "deposit" ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Move cash from the drawer to a bank account. This is an asset
              transfer — not an operating expense.
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(amount);
                if (!bankAccountId) {
                  toast.error("Select a bank account");
                  return;
                }
                if (!amt || amt <= 0) {
                  toast.error("Enter a valid amount");
                  return;
                }
                depositMut.mutate({
                  bankAccountId,
                  amount: amt,
                  outletId,
                  businessDate,
                  description: description || undefined,
                });
              }}
            >
              <PosBankDepositAccountPicker
                value={bankAccountId}
                onChange={setBankAccountId}
              />
              <div className="space-y-1">
                <Label className="text-xs">Amount (TZS)</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-10 rounded-lg font-money text-foreground"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  className="min-h-11 rounded-lg text-foreground"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <Button
                type="submit"
                className="h-10 w-full rounded-xl btn-primary-gradient"
                disabled={depositMut.isPending || !bankAccountId}
              >
                {depositMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Landmark className="mr-2 size-4" />
                    Record bank deposit
                  </>
                )}
              </Button>
            </form>

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Deposits on {businessDate}
              </p>
              {depositsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : dayDeposits.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No drawer deposits on this date
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {dayDeposits.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-border bg-card px-2.5 py-2 text-xs"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {t.account_name}
                        </span>
                        <span className="shrink-0 font-money font-bold text-inflow">
                          {formatTzs(t.amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {t.description ?? "Cash drawer deposit"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quick receive, or use full GRN for multi-line deliveries.
            </p>
            <Link
              href="/inventory/receive"
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-primary hover:bg-primary/10"
            >
              Full receive goods
              <ExternalLink className="size-3.5" />
            </Link>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!productId) {
                  toast.error("Select a product");
                  return;
                }
                const qty = Number(stockQty);
                const cost = Number(unitCost);
                if (!qty || qty <= 0 || cost < 0) {
                  toast.error("Enter quantity and unit cost");
                  return;
                }
                stockMut.mutate({
                  outletId,
                  supplierId: supplierId || null,
                  paymentMethod: paidCash ? "cash" : "on_account",
                  taxRate,
                  businessDate,
                  lines: [{ productId, quantity: qty, unitCost: cost }],
                  notes: description || undefined,
                });
              }}
            >
              {stickySupplierName || supplierId ? (
                <p className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs">
                  Supplier:{" "}
                  <strong>
                    {stickySupplierName ||
                      suppliers.find((s) => s.id === supplierId)?.name ||
                      "Selected"}
                  </strong>
                </p>
              ) : null}
              {suppliersError ? (
                <p className="text-xs text-destructive">
                  {suppliersLoadError instanceof Error
                    ? suppliersLoadError.message
                    : "Could not load suppliers"}
                </p>
              ) : null}
              <div className="space-y-1">
                <Label className="text-xs">Supplier</Label>
                <select
                  aria-label="Supplier"
                  className="min-h-11 w-full rounded-lg border border-input bg-surface-1 px-3 text-sm text-foreground"
                  value={supplierId || ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSupplierId(id);
                    const s = suppliers.find((x) => x.id === id);
                    setStickySupplierName(s?.name ?? "");
                  }}
                >
                  <option value="">No supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Input
                  className="min-h-11 flex-1 rounded-lg bg-surface-1 text-sm"
                  placeholder="New supplier name"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0 px-3 text-xs"
                  disabled={!newSupplier.trim() || addSupplierMut.isPending}
                  onClick={() => addSupplierMut.mutate(newSupplier.trim())}
                >
                  {addSupplierMut.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Product</Label>
                <select
                  aria-label="Product"
                  className="min-h-11 w-full rounded-lg border border-input bg-surface-1 px-3 text-sm text-foreground"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  <option value="">Select product</option>
                  {products.slice(0, 200).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    className="min-h-11 rounded-lg"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cost/unit</Label>
                  <Input
                    type="number"
                    min={0}
                    className="min-h-11 rounded-lg font-money"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder={
                      selectedProduct
                        ? String(selectedProduct.costPrice)
                        : "0"
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={paidCash}
                  onChange={(e) => setPaidCash(e.target.checked)}
                  className="size-4 rounded border-border"
                />
                Paid cash now
              </label>
              <Button
                type="submit"
                variant="secondary"
                className="h-10 w-full rounded-xl"
                disabled={stockMut.isPending}
              >
                {stockMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Receive stock"
                )}
              </Button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
