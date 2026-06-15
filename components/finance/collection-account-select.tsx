"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchPaymentAccounts } from "@/lib/api/banking-fetch";
import {
  filterCollectionAccountsForMethod,
  needsCollectionAccount,
} from "@/lib/finance/collection-accounts";
import { formatAccountDetails, paymentAccountTypeLabel } from "@/lib/constants/payment-accounts";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  paymentMethod: string;
  value: string;
  onValueChange: (id: string) => void;
  label?: string;
  id?: string;
};

export function CollectionAccountSelect({
  paymentMethod,
  value,
  onValueChange,
  label = "Pay from account",
  id = "collection-account",
}: Props) {
  const needsAccount = needsCollectionAccount(paymentMethod);

  const { data: accounts = [] } = useQuery({
    queryKey: ["payment-accounts", "collection", paymentMethod],
    enabled: needsAccount,
    queryFn: fetchPaymentAccounts,
    select: (all) => filterCollectionAccountsForMethod(all, paymentMethod),
  });

  useEffect(() => {
    if (!needsAccount) {
      if (value) onValueChange("");
      return;
    }
    if (accounts.length === 1) {
      onValueChange(accounts[0]!.id);
    } else if (accounts.length !== 1 && value) {
      const stillValid = accounts.some((a) => a.id === value);
      if (!stillValid) onValueChange("");
    }
  }, [needsAccount, accounts, value, onValueChange]);

  if (!needsAccount) return null;

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-warning">
        Add a bank or M-Pesa account under Finance → Banking first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onValueChange(v ?? "")}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select account">
            {value
              ? accounts.find((a) => a.id === value)?.name ?? "Select account"
              : "Select account"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
              <span className="ml-1 text-muted-foreground">
                · {paymentAccountTypeLabel(a.account_type)} ·{" "}
                {formatTzs(a.current_balance)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value ? (
        <p className="form-hint">
          {formatAccountDetails(accounts.find((a) => a.id === value)!)}
        </p>
      ) : null}
    </div>
  );
}
