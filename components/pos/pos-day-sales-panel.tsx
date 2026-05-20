"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { listRecentSales } from "@/lib/actions/sales";
import { formatTzs } from "@/lib/utils/currency";
import { formatDateTimeEAT } from "@/lib/utils/currency";

type Props = {
  outletId: string;
  viewFrom: string;
  viewTo: string;
};

export function PosDaySalesPanel({ outletId, viewFrom, viewTo }: Props) {
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["pos-sales-range", outletId, viewFrom, viewTo],
    queryFn: () =>
      listRecentSales(80, {
        outletId,
        fromDate: viewFrom,
        toDate: viewTo,
      }),
  });

  const total = sales.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Sales in range ·{" "}
          <span className="font-money font-semibold text-inflow">
            {formatTzs(total)}
          </span>
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : sales.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            No sales in this date range.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sales.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-border bg-card px-2.5 py-2 text-xs"
              >
                <div className="flex justify-between gap-2">
                  <Link
                    href={`/sales/${s.id}`}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    {s.invoice_no}
                  </Link>
                  <span className="font-money font-bold text-inflow">
                    {formatTzs(s.total_amount)}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {formatDateTimeEAT(s.sale_date)}
                  {s.customer_name ? ` · ${s.customer_name}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
