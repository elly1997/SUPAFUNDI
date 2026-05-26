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
  className?: string;
  showSync?: boolean;
  showPricing?: boolean;
};

/** POS-specific controls row (sits below global module nav). */
export function PosHeader({
  outlets,
  outletId,
  pricingMode,
  onPricingModeChange,
  cartSummary,
  className,
  showSync = true,
  showPricing = true,
}: Props) {
  return (
    <div className={`shrink-0 border-b border-border bg-surface-1/50 px-3 py-2 sm:px-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <PosOutletPicker outlets={outlets} className="min-w-[9rem] flex-1 sm:max-w-xs" />
        {outletId ? (
          <div className="order-3 w-full sm:order-none sm:w-auto">
            <CashSessionBar outletId={outletId} variant="inline" />
          </div>
        ) : null}
        {cartSummary ? (
          <span className="hidden rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary lg:inline-flex">
            {cartSummary}
          </span>
        ) : null}
        {(showSync || showPricing) && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {showSync && <PosSyncStatus />}
            {showPricing && (
              <PosPricingToggle mode={pricingMode} onChange={onPricingModeChange} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
