import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type KpiVariant = "default" | "inflow" | "outflow" | "warning";

type KpiCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  icon?: LucideIcon;
  variant?: KpiVariant;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
};

const variantStyles: Record<KpiVariant, string> = {
  default: "text-foreground",
  inflow: "text-inflow",
  outflow: "text-outflow",
  warning: "text-warning",
};

const iconBg: Record<KpiVariant, string> = {
  default: "bg-primary/10 text-primary",
  inflow: "bg-inflow/10 text-inflow",
  outflow: "bg-outflow/10 text-outflow",
  warning: "bg-warning/10 text-warning",
};

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  className,
  onClick,
  selected = false,
}: KpiCardProps) {
  const interactive = typeof onClick === "function";

  return (
    <Card
      className={cn(
        "dash-stat-card shadow-card",
        interactive &&
          "min-h-11 cursor-pointer text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected && "border-primary/60 ring-2 ring-primary/40",
        className
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              iconBg[variant]
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-money text-2xl font-semibold tabular-nums",
            variantStyles[variant]
          )}
        >
          {value}
        </p>
        {subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
        {interactive ? (
          <p className="mt-1 text-[11px] font-medium text-primary">
            {selected ? "Showing in list below · tap to clear" : "Tap to show in list"}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
