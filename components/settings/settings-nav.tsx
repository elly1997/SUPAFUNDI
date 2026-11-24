"use client";

import {
  Banknote,
  Building2,
  Database,
  MessageSquare,
  Palette,
  Store,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type SettingsNavItem = {
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const SETTINGS_NAV: SettingsNavItem[] = [
  {
    label: "General",
    description: "Company, VAT, margin, receipts",
    href: "/settings/general",
    icon: Building2,
  },
  {
    label: "Appearance",
    description: "Dark or light theme",
    href: "/settings/appearance",
    icon: Palette,
  },
  {
    label: "SMS & marketing",
    description: "Reminders and campaigns",
    href: "/settings/sms",
    icon: MessageSquare,
  },
  {
    label: "Expense categories",
    description: "Cash out & expense groups",
    href: "/settings/expense-categories",
    icon: Banknote,
  },
  {
    label: "Product categories",
    description: "Catalog groups & cleanup",
    href: "/settings/product-categories",
    icon: Tags,
  },
  {
    label: "Outlets",
    description: "Branches & warehouses",
    href: "/settings/outlets",
    icon: Store,
  },
  {
    label: "Users",
    description: "Staff & access",
    href: "/settings/users",
    icon: Users,
  },
  {
    label: "Data & backup",
    description: "Exports and catalog restore",
    href: "/settings/data",
    icon: Database,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Settings sections"
      className="lg:sticky lg:top-0 lg:w-60 lg:shrink-0 lg:self-start"
    >
      <p className="mb-2 hidden px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:block">
        Settings
      </p>
      <ul className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {SETTINGS_NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 touch-manipulation transition-colors lg:items-start",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0 lg:mt-0.5" aria-hidden />
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-sm font-semibold lg:whitespace-normal">
                    {item.label}
                  </span>
                  <span className="mt-0.5 hidden text-[11px] font-normal leading-snug text-muted-foreground lg:block">
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
