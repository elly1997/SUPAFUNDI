"use client";

import { PauseCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HeldSale } from "@/lib/pos/held-sales";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  held: HeldSale[];
  canHold: boolean;
  onHold: () => void;
  onResume: (id: string) => void;
  className?: string;
};

function heldTotal(h: HeldSale): number {
  const fromCharge = Number(h.chargeTotal);
  if (Number.isFinite(fromCharge) && fromCharge > 0) return Math.round(fromCharge);
  return Math.round(
    h.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  );
}

export function PosHeldSalesBar({
  held,
  canHold,
  onHold,
  onResume,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border/80 bg-muted/20 px-3 py-1.5",
        className
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-9 rounded-lg text-xs"
        disabled={!canHold}
        onClick={onHold}
        title="Park this cart and start a new sale"
      >
        <PauseCircle className="mr-1.5 size-3.5" />
        Hold sale
      </Button>
      {held.length > 0 && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Held
          </span>
          {held.map((h) => (
            <Button
              key={h.id}
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-9 max-w-[11rem] truncate rounded-lg text-xs"
              onClick={() => onResume(h.id)}
              title={`Resume ${h.label}`}
            >
              <Play className="mr-1 size-3 shrink-0" />
              <span className="truncate">{h.label}</span>
              <span className="ml-1 font-money shrink-0 tabular-nums text-primary">
                {formatTzs(heldTotal(h))}
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
