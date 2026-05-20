"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ExternalLink, Loader2, TrendingDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PosBusinessDateStrip } from "@/components/pos/pos-business-date-strip";
import { PosExpenseCategorySelect } from "@/components/pos/pos-expense-category-select";
import { PosDaySalesPanel } from "@/components/pos/pos-day-sales-panel";
import { listExpenses, recordExpense } from "@/lib/actions/expenses";
import { listSuppliersForOrg, receiveGoods } from "@/lib/actions/grn";
import { cn } from "@/lib/utils";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { formatTzs } from "@/lib/utils/currency";
import { useBusinessDateStore } from "@/stores/businessDateStore";
import type { PosProductRow } from "@/hooks/usePosProducts";

const EXPENSE_PRESETS = [
  { label: "Tea / lunch", category: "misc", amount: 5000 },
  { label: "Transport", category: "misc", amount: 10000 },
  { label: "Airtime", category: "utilities", amount: 5000 },
  { label: "Fuel", category: "misc", amount: 20000 },
] as const;

type Tab = "expense" | "stock" | "sales";

type Props = {
  outletId: string;
  products: PosProductRow[];
  className?: string;
};

export function PosCashflowPanel({ outletId, products, className }: Props) {
  const [tab, setTab] = useState<Tab>("expense");
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const [viewFrom, setViewFrom] = useState(businessDate);
  const [viewTo, setViewTo] = useState(businessDate);
  const [category, setCategory] = useState<string>("misc");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [stockQty, setStockQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [paidCash, setPaidCash] = useState(true);
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["pos-expenses", outletId, viewFrom, viewTo],
    queryFn: () =>
      listExpenses(80, { outletId, fromDate: viewFrom, toDate: viewTo }),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["pos-suppliers"],
    queryFn: listSuppliersForOrg,
    enabled: tab === "stock",
  });

  const rangeExpenses = expenses.filter(
    (e) => e.expense_date >= viewFrom && e.expense_date <= viewTo
  );
  const rangeTotal = rangeExpenses.reduce((s, e) => s + e.amount, 0);

  const recordMut = useMutation({
    mutationFn: recordExpense,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Expense recorded");
        setAmount("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-expenses"] });
      } else toast.error(r.message);
    },
  });

  const stockMut = useMutation({
    mutationFn: receiveGoods,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Stock purchase recorded");
        setStockQty("1");
        setUnitCost("");
        setProductId("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      } else toast.error(r.message);
    },
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
              Range total {formatTzs(rangeTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-b border-border p-2">
        <PosBusinessDateStrip
          viewFrom={viewFrom}
          viewTo={viewTo}
          onViewFromChange={setViewFrom}
          onViewToChange={setViewTo}
        />
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border p-2">
        <button
          type="button"
          onClick={() => setTab("expense")}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold touch-manipulation",
            tab === "expense"
              ? "bg-outflow/15 text-outflow"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setTab("stock")}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold touch-manipulation",
            tab === "stock"
              ? "bg-info/15 text-info"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          Stock
        </button>
        <button
          type="button"
          onClick={() => setTab("sales")}
          className={cn(
            "rounded-lg py-2 text-xs font-semibold touch-manipulation",
            tab === "sales"
              ? "bg-inflow/15 text-inflow"
              : "text-muted-foreground hover:bg-muted/50"
          )}
        >
          Sales
        </button>
      </div>

      <div className="pos-scroll-area min-h-0 flex-1 p-3">
        {tab === "sales" ? (
          <PosDaySalesPanel
            outletId={outletId}
            viewFrom={viewFrom}
            viewTo={viewTo}
          />
        ) : tab === "expense" ? (
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
                    className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-primary/40 touch-manipulation"
                    onClick={() => {
                      setCategory(p.category);
                      setAmount(String(p.amount));
                      setDescription(p.label);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info touch-manipulation"
                  onClick={() => {
                    setCategory("bank");
                    setDescription("Bank deposit");
                  }}
                >
                  Bank deposit
                </button>
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
                  className="h-9 rounded-lg text-foreground"
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
                Recent in range
              </p>
              {expensesLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : rangeExpenses.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No expenses in this range
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rangeExpenses.map((e) => (
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
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quick receive, or use full GRN for multi-line deliveries.
            </p>
            <Link
              href="/inventory/receive"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-primary hover:bg-primary/10"
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
                  taxRate: 18,
                  lines: [{ productId, quantity: qty, unitCost: cost }],
                  notes: description || undefined,
                });
              }}
            >
              <div className="space-y-1">
                <Label className="text-xs">Supplier</Label>
                <Select
                  value={supplierId || "__none__"}
                  onValueChange={(v) =>
                    setSupplierId(!v || v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="No supplier" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="__none__">No supplier</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Product</Label>
                <Select
                  value={productId || undefined}
                  onValueChange={(v) => setProductId(v ?? "")}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {products.slice(0, 200).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-9 rounded-lg"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cost/unit</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-9 rounded-lg font-money"
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
