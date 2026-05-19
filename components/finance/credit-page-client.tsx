"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Wallet } from "lucide-react";
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
import {
  listCustomersWithBalance,
  recordCustomerPayment,
} from "@/lib/actions/credit";
import { formatTzs } from "@/lib/utils/currency";

export function CreditPageClient() {
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "mpesa" | "bank_transfer">("cash");
  const queryClient = useQueryClient();

  const { data: balances = [], isLoading } = useQuery({
    queryKey: ["credit-balances"],
    queryFn: listCustomersWithBalance,
  });

  const payMut = useMutation({
    mutationFn: recordCustomerPayment,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payment recorded");
        setOpen(false);
        setAmount("");
        queryClient.invalidateQueries({ queryKey: ["credit-balances"] });
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Accounts receivable</CardTitle>
        <Button onClick={() => setOpen(true)}>
          <Wallet className="mr-2 h-4 w-4" />
          Record payment
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : balances.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No outstanding customer balances.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Credit limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-right text-amber-700">
                    {formatTzs(c.outstanding_balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatTzs(c.credit_limit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record customer payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={customerId}
                onValueChange={(v) => setCustomerId(v ?? "")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {balances.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {formatTzs(c.outstanding_balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="mpesa">M-Pesa</SelectItem>
                  <SelectItem value="bank_transfer">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!customerId || !amount || payMut.isPending}
              onClick={() =>
                payMut.mutate({
                  customerId,
                  amount: Number(amount),
                  paymentMethod: method,
                })
              }
            >
              {payMut.isPending ? "Saving…" : "Post payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
