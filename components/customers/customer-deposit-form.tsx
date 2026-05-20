"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { recordCustomerDeposit } from "@/lib/actions/customers";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  customerId: string;
  customerName: string;
};

export function CustomerDepositForm({ customerId, customerName }: Props) {
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "mpesa" | "bank_transfer"
  >("cash");

  const mut = useMutation({
    mutationFn: recordCustomerDeposit,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Deposit recorded");
        setAmount("");
        window.location.reload();
      } else toast.error(r.message);
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
        mut.mutate({
          customerId,
          outletId,
          amount: amt,
          paymentMethod,
          notes: `Deposit — ${customerName}`,
        });
      }}
    >
      <div className="space-y-1">
        <Label className="text-xs">Amount (TZS)</Label>
        <Input
          type="number"
          min={1}
          className="w-36"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Payment</Label>
        <Select
          value={paymentMethod}
          onValueChange={(v) =>
            setPaymentMethod(v as "cash" | "mpesa" | "bank_transfer")
          }
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
