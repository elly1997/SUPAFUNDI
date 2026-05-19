"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  filterPrimaryNavForRole,
  isNavItemActive,
} from "@/components/layout/nav-config";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

export function AppNavTabs() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.session?.role);

  if (!role) {
    return null;
  }

  const tabs = filterPrimaryNavForRole(role);

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border bg-header px-3 py-2 scrollbar-thin"
      aria-label="Main navigation"
    >
      {tabs.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            className={cn("nav-tab touch-manipulation", active && "nav-tab-active")}
          >
            <Icon className="size-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
