"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { fetchPosPaymentAccounts } from "@/lib/api/banking-fetch";
import { recordCustomerDeposit } from "@/lib/actions/customers";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  customerId: string;
  customerName: string;
};

export function CustomerDepositForm({ customerId, customerName }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const outletId = useAuthStore((s) => s.activeOutletId);
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "mpesa" | "bank_transfer"
  >("cash");
  const [bankAccountId, setBankAccountId] = useState("");

  const needsBank =
    paymentMethod === "mpesa" || paymentMethod === "bank_transfer";

  const { data: accounts = [] } = useQuery({
    queryKey: ["pos-accounts", paymentMethod],
    enabled: needsBank,
    queryFn: () =>
      fetchPosPaymentAccounts(
        paymentMethod === "mpesa" ? "mpesa" : "bank_transfer"
      ),
  });

  const mut = useMutation({
    mutationFn: recordCustomerDeposit,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Deposit recorded");
        setAmount("");
        void queryClient.invalidateQueries({ queryKey: ["customers"] });
        router.refresh();
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Deposit failed");
    },
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const amt = Number(amount);
        if (!outletId) {
          toast.error("Select an active outlet in the header");
          return;
        }
        if (!amt || amt <= 0) {
          toast.error("Enter a valid amount");
          return;
        }
        if (needsBank && !bankAccountId) {
          toast.error("Select a collection account");
          return;
        }
        mut.mutate({
          customerId,
          outletId,
          amount: amt,
          paymentMethod,
          paymentDate,
          bankAccountId: bankAccountId || undefined,
          notes: `DEP-${customerName}`,
        });
      }}
    >
      <div className="space-y-1">
        <Label className="text-xs">Amount (TZS)</Label>
        <Input
          type="number"
          min={1}
          className="w-36 font-money"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Date</Label>
        <Input
          type="date"
          className="w-36"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Payment</Label>
        <Select
          value={paymentMethod}
          onValueChange={(v) => {
            setPaymentMethod(v as typeof paymentMethod);
            setBankAccountId("");
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="mpesa">M-Pesa</SelectItem>
            <SelectItem value="bank_transfer">Bank</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {needsBank && (
        <div className="space-y-1">
          <Label className="text-xs">Account</Label>
          <Select
            value={bankAccountId}
            onValueChange={(v) => setBankAccountId(v ?? "")}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Button type="submit" size="sm" disabled={mut.isPending}>
        {mut.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          "Record deposit"
        )}
      </Button>
    </form>
  );
}
