"use client";

import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    logger.error("dashboard segment error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-base font-semibold text-destructive">
        This section failed to load
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Inventory, sales, and other heavy modules are isolated so a fault here
        does not take down the whole shell.
      </p>
      <button
        type="button"
        className={cn(buttonVariants(), "mt-4")}
        onClick={() => reset()}
      >
        Retry
      </button>
    </div>
  );
}
