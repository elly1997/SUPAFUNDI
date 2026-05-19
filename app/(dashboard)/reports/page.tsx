import { ReportsAnalyticsClient } from "@/components/reports/reports-analytics-client";
import {
  getOperationalReportsByRange,
  getProfitLossStatement,
} from "@/lib/actions/reports";
import { format, subMonths } from "date-fns";

function defaultFrom() {
  return format(subMonths(new Date(), 3), "yyyy-MM-dd");
}

function defaultTo() {
  return format(new Date(), "yyyy-MM-dd");
}

export default async function ReportsPage() {
  const from = defaultFrom();
  const to = defaultTo();
  let initialOperational;
  let initialPl;
  try {
    [initialOperational, initialPl] = await Promise.all([
      getOperationalReportsByRange(from, to),
      getProfitLossStatement(from, to),
    ]);
  } catch {
    /* client will refetch */
  }

  return (
    <ReportsAnalyticsClient
      initialOperational={initialOperational}
      initialPl={initialPl}
      initialFrom={from}
      initialTo={to}
    />
  );
}
