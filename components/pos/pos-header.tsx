"use client";

import { CashSessionBar } from "@/components/pos/cash-session-bar";
import { PosOutletPicker } from "@/components/pos/pos-outlet-picker";
import { PosPricingToggle } from "@/components/pos/pos-pricing-toggle";
import { PosSyncStatus } from "@/components/pos/pos-sync-status";
import type { PosPricingMode } from "@/hooks/usePosProducts";
import { cn } from "@/lib/utils";

export type PosOutletOption = { id: string; name: string; is_active?: boolean };

type Props = {
  outlets: PosOutletOption[];
  outletId: string | null;
  pricingMode: PosPricingMode;
  onPricingModeChange: (mode: PosPricingMode) => void;
  cartSummary?: string | null;
  className?: string;
  showSync?: boolean;
  showPricing?: boolean;
  /** Hide outlet/session when those live elsewhere (toolbar mode). */
  showOutletSession?: boolean;
};

/** Dense POS controls — outlet, drawer, retail/wholesale. */
export function PosHeader({
  outlets,
  outletId,
  pricingMode,
  onPricingModeChange,
  cartSummary,
  className,
  showSync = true,
  showPricing = true,
  showOutletSession = true,
}: Props) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border bg-surface-1/40 px-2 py-1 sm:px-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {showOutletSession ? (
          <>
            <PosOutletPicker
              outlets={outlets}
              compact
              className="min-w-[8rem] flex-1 sm:max-w-[12rem]"
            />
            {outletId ? (
              <div className="order-3 w-full sm:order-none sm:w-auto">
                <CashSessionBar outletId={outletId} variant="inline" />
              </div>
            ) : null}
          </>
        ) : null}
        {cartSummary ? (
          <span className="hidden rounded-md bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary lg:inline-flex">
            {cartSummary}
          </span>
        ) : null}
        {(showSync || showPricing) && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
