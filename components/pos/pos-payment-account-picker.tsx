"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  formatAccountDetails,
  paymentAccountTypeLabel,
} from "@/lib/constants/payment-accounts";
import { listPosPaymentAccounts } from "@/lib/actions/banking";

export type PosCollectionMethod = "mpesa" | "bank_transfer" | "card";

type Props = {
  posMethod: PosCollectionMethod;
  value: string;
  onChange: (accountId: string) => void;
  className?: string;
};

export function PosPaymentAccountPicker({
  posMethod,
  value,
  onChange,
  className,
}: Props) {
  const { data: accounts = [], isLoading, isError, error } = useQuery({
    queryKey: ["pos-payment-accounts", posMethod],
    queryFn: () => listPosPaymentAccounts(posMethod),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (accounts.length > 0 && !value) {
      onChange(accounts[0]!.id);
    }
  }, [accounts, value, onChange]);

  if (isLoading) {
    return (
      <div className={className}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-xs text-destructive">
        {error instanceof Error ? error.message : "Could not load accounts"}
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        No collection account for this method in Banking. Add one under Finance →
        Banking and enable &quot;Show on POS&quot;.
      </p>
    );
  }

  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Collect to
      </Label>
      <Select
        value={value || accounts[0]?.id}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <SelectTrigger className="mt-1 h-11 rounded-xl">
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
              <span className="ml-1 text-muted-foreground">
                · {paymentAccountTypeLabel(a.account_type)}
                {formatAccountDetails(a) !== "—"
                  ? ` · ${formatAccountDetails(a)}`
                  : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function needsPosPaymentAccount(method: string): method is PosCollectionMethod {
  return method === "mpesa" || method === "bank_transfer" || method === "card";
}
