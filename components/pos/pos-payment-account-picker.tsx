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
import { fetchCashDepositAccounts, fetchPosPaymentAccounts } from "@/lib/api/banking-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

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
    queryFn: () => fetchPosPaymentAccounts(posMethod),
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

type BankDepositPickerProps = {
  value: string;
  onChange: (accountId: string) => void;
  className?: string;
};

/** Registered bank accounts for POS cash-to-bank (all active banks in Finance → Banking). */
export function PosBankDepositAccountPicker({
  value,
  onChange,
  className,
}: BankDepositPickerProps) {
  const { data: accounts = [], isLoading, isError, error } = useQuery({
    queryKey: ["cash-deposit-accounts"],
    queryFn: fetchCashDepositAccounts,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (accounts.length > 0 && !value) {
      onChange(accounts[0]!.id);
    }
  }, [accounts, value, onChange]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 py-2", className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading bank accounts…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <p className={cn("text-xs text-destructive", className)}>
        {error instanceof Error ? error.message : "Could not load bank accounts"}
      </p>
    );
  }

  if (accounts.length === 0) {
    return (
      <p
        className={cn(
          "rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning",
          className
        )}
      >
        No bank accounts registered yet. Add one under Finance → Banking (Add
        account → Bank account).
      </p>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Deposit to bank
      </Label>
      <Select
        value={value || accounts[0]?.id}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <SelectTrigger className="h-11 rounded-xl">
          <SelectValue placeholder="Select bank account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              <span className="font-medium">{a.name}</span>
              {formatAccountDetails(a) !== "—" ? (
                <span className="ml-1 text-muted-foreground">
                  · {formatAccountDetails(a)}
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ul className="space-y-1 rounded-lg border border-border/60 bg-surface-1/30 p-2">
        {accounts.map((a) => {
          const selected = (value || accounts[0]?.id) === a.id;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onChange(a.id)}
                className={cn(
                  "flex w-full flex-col rounded-lg px-2.5 py-2 text-left text-xs touch-manipulation transition-colors",
                  selected
                    ? "border border-primary/50 bg-primary/10 text-foreground"
                    : "border border-transparent hover:bg-muted/40"
                )}
              >
                <span className="font-semibold">{a.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {paymentAccountTypeLabel(a.account_type)}
                  {formatAccountDetails(a) !== "—"
                    ? ` · ${formatAccountDetails(a)}`
                    : ""}
                </span>
                <span className="mt-0.5 font-money text-[11px] text-muted-foreground">
                  Balance {formatTzs(a.current_balance)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
