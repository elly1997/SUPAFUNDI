"use client";

import { Info } from "lucide-react";
import type { PosPricingMode } from "@/hooks/usePosProducts";
import { cn } from "@/lib/utils";

type Props = {
  mode: PosPricingMode;
  customerName?: string | null;
  className?: string;
};

export function PosWholesaleBanner({ mode, customerName, className }: Props) {
  if (mode !== "wholesale") return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b bg-info/10 px-4 py-2 text-sm text-info",
        className
      )}
    >
      <Info className="size-4 shrink-0" />
      <span>
        <strong className="font-semibold">Wholesale pricing</strong>
        {customerName
          ? ` · ${customerName} gets wholesale rates`
          : " · All lines use wholesale prices"}
      </span>
    </div>
  );
}
