"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
import { listExpenses, recordExpense } from "@/lib/actions/expenses";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

const CATEGORIES = ["rent", "utilities", "wages", "bank", "misc"] as const;

export function PosExpensesPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [category, setCategory] = useState<string>("misc");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const outletId = useAuthStore((s) => s.activeOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["pos-expenses"],
    queryFn: () => listExpenses(15),
  });

  const todayExpenses = expenses.filter((e) => e.expense_date === businessDate);

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
              recordMut.mutate({
                outletId: outletId ?? undefined,
                category,
                description: description || undefined,
                amount: amt,
                paidFromCash: true,
                expenseDate: businessDate,
              });
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v ?? "misc")}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
