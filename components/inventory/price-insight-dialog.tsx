"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PricingRecommendationHint } from "@/components/inventory/pricing-recommendation-hint";
import type { PriceRecommendation } from "@/lib/analytics/pricing-insights";
import { needsPriceAdjustment } from "@/lib/analytics/pricing-insights";
import { cn } from "@/lib/utils";

type Props = {
  recommendation?: PriceRecommendation;
  productName: string;
  onApplyPrice?: (price: number) => void;
  applying?: boolean;
  className?: string;
};

export function PriceInsightIconButton({
  recommendation,
  productName,
  onApplyPrice,
  applying,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  if (!recommendation) return null;

  const hasInsight =
    needsPriceAdjustment(recommendation) ||
    (recommendation.reasons?.length ?? 0) > 0;

  if (!hasInsight) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("size-7 shrink-0 text-info", className)}
        title="Price insight & suggestion"
        onClick={() => setOpen(true)}
      >
        <Info className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{productName}</DialogTitle>
          </DialogHeader>
          <PricingRecommendationHint
            recommendation={recommendation}
            onApplyPrice={
              onApplyPrice
                ? (price) => {
                    onApplyPrice(price);
                    setOpen(false);
                  }
                : undefined
            }
            applying={applying}
          />
          {recommendation.action ? (
            <p className="mt-2 text-xs text-muted-foreground">{recommendation.action}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
