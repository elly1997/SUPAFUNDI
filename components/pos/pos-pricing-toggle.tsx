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
      className="inline-flex rounded-xl border border-border bg-card p-1 shadow-sm"
    >
      {(["retail", "wholesale"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "touch-manipulation rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition-all",
            mode === m
              ? m === "wholesale"
                ? "bg-info text-white shadow-sm"
                : "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
