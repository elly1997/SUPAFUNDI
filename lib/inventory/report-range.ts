import {
  format,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";

export type InventoryReportPreset = "1M" | "YTD" | "QUARTER" | "6M";

export const INVENTORY_REPORT_PRESETS: {
  id: InventoryReportPreset;
  label: string;
  description: string;
}[] = [
  { id: "1M", label: "1M", description: "Last 30 days" },
  { id: "YTD", label: "YTD", description: "Year to date" },
  { id: "QUARTER", label: "Quarterly", description: "Current quarter" },
  { id: "6M", label: "6M", description: "Last 6 months" },
];

export function resolveInventoryReportRange(
  preset: InventoryReportPreset,
  asOf = new Date()
): { from: string; to: string } {
  const to = format(asOf, "yyyy-MM-dd");
  switch (preset) {
    case "1M":
      return { from: format(subDays(asOf, 29), "yyyy-MM-dd"), to };
    case "6M":
      return { from: format(subMonths(asOf, 6), "yyyy-MM-dd"), to };
    case "YTD":
      return { from: format(startOfYear(asOf), "yyyy-MM-dd"), to };
    case "QUARTER":
      return { from: format(startOfQuarter(asOf), "yyyy-MM-dd"), to };
    default:
      return { from: format(subDays(asOf, 29), "yyyy-MM-dd"), to };
  }
}
