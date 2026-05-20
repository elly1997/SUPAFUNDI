import { ReportsAnalyticsClient } from "@/components/reports/reports-analytics-client";

/** Reports load client-side per tab to keep first paint fast. */
export default function ReportsPage() {
  return <ReportsAnalyticsClient />;
}
