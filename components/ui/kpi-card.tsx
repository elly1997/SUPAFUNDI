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
}: KpiCardProps) {
  return (
    <Card className={cn("dash-stat-card shadow-card", className)}>
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
      </CardContent>
    </Card>
  );
}
