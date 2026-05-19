"use client";

import { usePathname } from "next/navigation";
import { AppBrandHeader } from "@/components/layout/app-brand-header";
import { cn } from "@/lib/utils";

type DashboardShellProps = {
  outlets: { id: string; name: string }[];
  children: React.ReactNode;
};

export function DashboardShell({ outlets, children }: DashboardShellProps) {
  const pathname = usePathname();
  const isPos = pathname === "/pos" || pathname.startsWith("/pos/");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <AppBrandHeader outlets={outlets} />
      <main
        className={cn(
          "min-h-0 flex-1",
          isPos ? "overflow-hidden" : "overflow-y-auto p-4 md:p-6"
        )}
      >
        {children}
      </main>
    </div>
  );
}
