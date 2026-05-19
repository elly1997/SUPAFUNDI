"use client";

import { useEffect, useState } from "react";
import { EAST_AFRICA_TZ } from "@/lib/utils/currency";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <span className="hidden text-xs text-muted-foreground lg:inline">
        ——
      </span>
    );
  }

  const formatted = new Intl.DateTimeFormat("en-KE", {
    timeZone: EAST_AFRICA_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return (
    <time
      dateTime={now.toISOString()}
      className="hidden text-xs tabular-nums text-muted-foreground lg:inline"
    >
      {formatted}
    </time>
  );
}
