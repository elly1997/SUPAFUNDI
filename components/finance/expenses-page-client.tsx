"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PosExpenseCategorySelect } from "@/components/pos/pos-expense-category-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchExpenses, recordExpenseApi } from "@/lib/api/daily-ops-fetch";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { formatTzs } from "@/lib/utils/currency";

export function ExpensesPageClient() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("misc");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidCash, setPaidCash] = useState(true);
  const queryClient = useQueryClient();

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => fetchExpenses(50),
  });

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
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Expense failed"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Expenses</CardTitle>
        <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Record expense
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : expenses.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No expenses recorded yet.
          </p>
        ) : (
          <>
          <div className="space-y-3 md:hidden">
            {expenses.map((e) => (
              <div key={e.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {formatExpenseCategoryLabel(e.category ?? "misc")}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {e.description ?? "No description"}
                    </p>
                  </div>
                  <p className="shrink-0 font-money font-semibold">
                    {formatTzs(e.amount)}
                  </p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{e.expense_date}</p>
              </div>
            ))}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.expense_date}</TableCell>
                  <TableCell>
                    {formatExpenseCategoryLabel(e.category ?? "misc")}
                  </TableCell>
                  <TableCell>{e.description ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {formatTzs(e.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <PosExpenseCategorySelect
                value={category}
                onValueChange={setCategory}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amount (TZS)</Label>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select
                value={paidCash ? "cash" : "credit"}
                onValueChange={(v) => setPaidCash(v === "cash")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Paid from cash</SelectItem>
                  <SelectItem value="credit">On account (AP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() =>
                recordMut.mutate({
                  category,
                  description,
                  amount: Number(amount),
                  paidFromCash: paidCash,
                })
              }
              disabled={recordMut.isPending || !amount}
            >
              {recordMut.isPending ? "Saving…" : "Save & post"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
