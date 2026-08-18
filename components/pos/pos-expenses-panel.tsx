"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PosExpenseCategorySelect } from "@/components/pos/pos-expense-category-select";
import { CollectionAccountSelect } from "@/components/finance/collection-account-select";
import { needsCollectionAccount } from "@/lib/finance/collection-accounts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchExpenses, recordExpenseApi } from "@/lib/api/daily-ops-fetch";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

export function PosExpensesPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState<string>("misc");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "mpesa" | "bank_transfer"
  >("cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const outletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["pos-expenses", outletId],
    queryFn: () => fetchExpenses(15, { outletId }),
    enabled: !!outletId,
  });

  const todayExpenses = expenses.filter((e) => e.expense_date === businessDate);

  const recordMut = useMutation({
    mutationFn: recordExpenseApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Expense recorded");
        setAmount("");
        setDescription("");
        queryClient.invalidateQueries({ queryKey: ["pos-expenses"] });
        queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
        queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Expense failed"),
  });

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-card/50">
      <button
        type="button"
        className="flex items-center justify-between border-b border-border px-3 py-2 text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-sm font-semibold">💸 Today&apos;s expenses</span>
        {collapsed ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed ? (
        <>
          <form
            className="space-y-2 border-b border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const amt = Number(amount);
              if (!amt || amt <= 0) {
                toast.error("Enter a valid amount");
                return;
              }
              if (needsCollectionAccount(paymentMethod) && !bankAccountId) {
                toast.error("Select the bank or M-Pesa account");
                return;
              }
              recordMut.mutate({
                outletId: outletId ?? undefined,
                category,
                description: description || undefined,
                amount: amt,
                paymentMethod,
                bankAccountId: bankAccountId || undefined,
                expenseDate: businessDate,
              });
            }}
          >
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
                className="h-8 font-money"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) =>
                  setPaymentMethod(
                    (v ?? "cash") as "cash" | "mpesa" | "bank_transfer"
                  )
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CollectionAccountSelect
              paymentMethod={paymentMethod}
              value={bankAccountId}
              onValueChange={setBankAccountId}
              label="Pay from"
            />
            <div className="space-y-1">
              <Label className="text-xs">Note</Label>
              <Input
                className="h-8"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={recordMut.isPending}
            >
              {recordMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Add expense"
              )}
            </Button>
          </form>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Loading…
              </p>
            ) : todayExpenses.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No expenses today
              </p>
            ) : (
              <ul className="space-y-1.5">
                {todayExpenses.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium capitalize">
                        {e.category ?? "misc"}
                      </span>
                      <span className="font-money font-semibold text-outflow">
                        {formatTzs(e.amount)}
                      </span>
                    </div>
                    {e.description ? (
                      <p className="mt-0.5 truncate text-muted-foreground">
                        {e.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </aside>
  );
}
