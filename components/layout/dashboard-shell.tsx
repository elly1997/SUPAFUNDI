"use client";

import { usePathname } from "next/navigation";
import { AppBrandHeader } from "@/components/layout/app-brand-header";
import { BusinessDateBanner } from "@/components/layout/business-date-banner";
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
      <BusinessDateBanner />
      <main
        className={cn(
          "min-h-0 flex-1",
          isPos ? "overflow-hidden" : "overflow-y-auto overscroll-y-contain touch-pan-y p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-6"
        )}
      >
        {children}
      </main>
    </div>
  );
}
