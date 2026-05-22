import { cn } from "@/lib/utils";
import {
  paymentMethodLabel,
  poFulfilmentTag,
  poPaymentTag,
} from "@/lib/procurement/po-payment";

type Props = {
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  paidAt?: string | null;
  source?: string;
  className?: string;
};

export function PoStatusBadges({
  status,
  paymentStatus,
  paymentMethod,
  paidAt,
  source,
  className,
}: Props) {
  const pay = poPaymentTag(paymentStatus);
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          pay.variant === "paid" &&
            "bg-inflow/15 text-inflow ring-1 ring-inflow/30",
          pay.variant === "credit" &&
            "bg-warning/15 text-warning ring-1 ring-warning/30",
          pay.variant === "partial" &&
            "bg-info/15 text-info ring-1 ring-info/30"
        )}
      >
        {pay.label}
      </span>
      <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
        {poFulfilmentTag(status)}
      </span>
      {source === "grn" ? (
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          From GRN
        </span>
      ) : null}
      {paymentStatus === "paid" && paidAt ? (
        <span className="text-[10px] text-muted-foreground">
          Paid {paidAt}
          {paymentMethod ? ` · ${paymentMethodLabel(paymentMethod)}` : ""}
        </span>
      ) : null}
    </div>
  );
}
