"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeasonalPattern } from "@/lib/analytics/seasonal-insights";
import { formatTzs } from "@/lib/utils/currency";

/** Recharts SVG strokes cannot use CSS var() — use design tokens as hex. */
const CHART = {
  primary: "#f97316",
  primaryMuted: "rgba(249, 115, 22, 0.25)",
  info: "#3b82f6",
  infoMuted: "rgba(59, 130, 246, 0.15)",
  grid: "#334155",
  muted: "#94a3b8",
  card: "#1e293b",
  border: "#334155",
} as const;

function chartTooltipStyle() {
  return {
    background: CHART.card,
    border: `1px solid ${CHART.border}`,
    borderRadius: 8,
    fontSize: 12,
  };
}

function formatAxisMoney(v: number) {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

function formatAxisDate(iso: string, totalPoints: number) {
  const d = parseISO(iso);
  if (totalPoints > 45) return format(d, "d/M");
  if (totalPoints > 14) return format(d, "d MMM");
  return format(d, "EEE d");
}

export type DailySalesPoint = {
  date: string;
  total: number;
  count: number;
};

export function DailySalesChart({
  data,
  height = 280,
}: {
  data: DailySalesPoint[];
  height?: number;
}) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatAxisDate(d.date, data.length),
  }));
  const hasSales = data.some((d) => d.total > 0);
  const tickInterval =
    data.length > 20 ? Math.ceil(data.length / 10) : data.length > 10 ? 1 : 0;

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 8, left: 4, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART.grid}
            opacity={0.35}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART.muted, fontSize: 11 }}
            interval={tickInterval}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART.muted, fontSize: 11 }}
            tickFormatter={formatAxisMoney}
            width={52}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle()}
            cursor={{ fill: CHART.primaryMuted }}
            formatter={(value, name) => {
              if (name === "total") return [formatTzs(Number(value ?? 0)), "Sales"];
              return [String(value ?? 0), "Transactions"];
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as DailySalesPoint | undefined;
              return row?.date
                ? format(parseISO(row.date), "EEE d MMM yyyy")
                : "";
            }}
          />
          <Bar
            dataKey="total"
            name="total"
            fill={CHART.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={hasSales ? 48 : 8}
            minPointSize={hasSales ? 3 : 0}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type StockValuePoint = {
  date: string;
  value: number;
  retailValue: number;
};

export function StockValueTrendChart({
  data,
  height = 300,
}: {
  data: StockValuePoint[];
  height?: number;
}) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatAxisDate(d.date, data.length),
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART.grid}
            opacity={0.35}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART.muted, fontSize: 11 }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART.muted, fontSize: 11 }}
            tickFormatter={formatAxisMoney}
            width={56}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={chartTooltipStyle()}
            formatter={(value, name) => [
              formatTzs(Number(value ?? 0)),
              String(name) === "value" ? "At cost" : "At retail",
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as StockValuePoint | undefined;
              return row?.date
                ? format(parseISO(row.date), "EEE d MMM yyyy")
                : "";
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: CHART.muted }}
          />
          <Line
            type="stepAfter"
            dataKey="value"
            name="At cost"
            stroke={CHART.primary}
            strokeWidth={2.5}
            dot={{ r: 3, fill: CHART.primary, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            type="stepAfter"
            dataKey="retailValue"
            name="At retail"
            stroke={CHART.info}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const TENDENCY_FILL: Record<string, string> = {
  peak: "#f97316",
  quiet: "#475569",
  normal: "#3b82f6",
};

/** Average sales by weekday — highlights peak vs quiet days. */
export function WeekdayPatternChart({
  data,
  height = 240,
}: {
  data: SeasonalPattern[];
  height?: number;
}) {
  const chartData = data
    .filter((d) => d.dayCount > 0)
    .map((d) => ({
      ...d,
      shortLabel: d.label.slice(0, 3),
      fill: TENDENCY_FILL[d.tendency] ?? TENDENCY_FILL.normal,
    }));

  if (chartData.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Need at least 2 weeks of sales for weekday patterns.
      </p>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 12, right: 8, left: 4, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART.grid}
            opacity={0.35}
            vertical={false}
          />
          <XAxis
            dataKey="shortLabel"
            tick={{ fill: CHART.muted, fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART.muted, fontSize: 11 }}
            tickFormatter={formatAxisMoney}
            width={52}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle()}
            cursor={{ fill: CHART.primaryMuted }}
            formatter={(value, _name, item) => {
              const row = item.payload as SeasonalPattern & { fill: string };
              const tag =
                row.tendency === "peak"
                  ? "Peak"
                  : row.tendency === "quiet"
                    ? "Quiet"
                    : "Normal";
              return [formatTzs(Number(value ?? 0)), `Avg sales (${tag})`];
            }}
            labelFormatter={(_l, payload) => {
              const row = payload?.[0]?.payload as SeasonalPattern | undefined;
              return row ? `${row.label} · ${row.dayCount} day(s) in sample` : "";
            }}
          />
          <Bar dataKey="avgSales" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type TrendComparisonPoint = {
  date: string;
  sales: number;
  expenses: number;
  net: number;
};

/** Sales vs expenses trend for capital planning. */
export function SalesExpenseTrendChart({
  data,
  height = 260,
}: {
  data: TrendComparisonPoint[];
  height?: number;
}) {
  const chartData = data.map((d) => ({
    ...d,
    label: formatAxisDate(d.date, data.length),
  }));

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 12, right: 8, left: 4, bottom: 4 }}
        >
          <defs>
            <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART.primary} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART.primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART.grid}
            opacity={0.35}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fill: CHART.muted, fontSize: 11 }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            tick={{ fill: CHART.muted, fontSize: 11 }}
            tickFormatter={formatAxisMoney}
            width={52}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={chartTooltipStyle()}
            formatter={(value, name) => [
              formatTzs(Number(value ?? 0)),
              name === "sales"
                ? "Sales"
                : name === "expenses"
                  ? "Expenses"
                  : "Net",
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: CHART.muted }} />
          <Area
            type="monotone"
            dataKey="sales"
            name="sales"
            stroke={CHART.primary}
            fill="url(#salesGrad)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="expenses"
            name="expenses"
            stroke="#ef4444"
            fill="url(#expGrad)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
