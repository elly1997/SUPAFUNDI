"use client";

import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { PosOutletPicker } from "@/components/pos/pos-outlet-picker";
import { PosPricingToggle } from "@/components/pos/pos-pricing-toggle";
import { PosSyncStatus } from "@/components/pos/pos-sync-status";
import type { PosPricingMode } from "@/hooks/usePosProducts";

export type PosOutletOption = { id: string; name: string };

type Props = {
  outlets: PosOutletOption[];
  outletId: string | null;
  pricingMode: PosPricingMode;
  onPricingModeChange: (mode: PosPricingMode) => void;
  cartSummary?: string | null;
};

/** POS-specific controls row (sits below global module nav). */
export function PosHeader({
  outlets,
  outletId,
  pricingMode,
  onPricingModeChange,
  cartSummary,
}: Props) {
  return (
    <div className="shrink-0 border-b border-border bg-surface-1/50 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <PosOutletPicker outlets={outlets} className="min-w-[10rem] flex-1 sm:max-w-xs" />
        {outletId ? (
          <CashSessionBar outletId={outletId} variant="inline" />
        ) : null}
        {cartSummary ? (
          <span className="hidden rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary lg:inline-flex">
            {cartSummary}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <PosSyncStatus />
          <PosPricingToggle mode={pricingMode} onChange={onPricingModeChange} />
        </div>
      </div>
    </div>
  );
}
