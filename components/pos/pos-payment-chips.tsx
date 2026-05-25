"use client";

import {
  Banknote,
  Building2,
  CreditCard,
  Smartphone,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompleteSaleInput } from "@/lib/actions/sales";

export type PaymentMethod = CompleteSaleInput["paymentMethod"];

const METHODS: {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "mpesa", label: "M-Pesa", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "bank_transfer", label: "Bank", icon: Building2 },
  { value: "credit_account", label: "Account", icon: UserRound },
];

type Props = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

export function PosPaymentChips({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-2 xl:grid-cols-5">
      {METHODS.map(({ value: v, label, icon: Icon }) => {
        const selected = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center transition-all touch-manipulation active:scale-[0.97]",
              selected
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className={cn("size-5", selected && "text-primary")} />
            <span className="text-xs font-semibold leading-tight">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
