"use client";

import { cn } from "@/lib/utils";
import type { PosPricingMode } from "@/hooks/usePosProducts";

type Props = {
  mode: PosPricingMode;
  onChange: (mode: PosPricingMode) => void;
};

export function PosPricingToggle({ mode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Pricing mode"
      className="inline-flex rounded-lg border border-border bg-card p-0.5 shadow-sm"
    >
      {(["retail", "wholesale"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "min-h-9 touch-manipulation rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-all",
            mode === m
              ? m === "wholesale"
                ? "bg-info text-white shadow-sm"
                : "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {m === "retail" ? "Retail" : "Wholesale"}
        </button>
      ))}
    </div>
  );
}
