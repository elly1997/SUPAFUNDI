"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const LABELS: Record<string, string> = {
  "": "Dashboard",
  "daily-closing": "Daily closing",
  pos: "POS Terminal",
  sales: "Sales",
  inventory: "Inventory",
  products: "Products",
  stock: "Stock",
  receive: "Receive goods",
  transfers: "Transfers",
  "purchase-orders": "Purchase orders",
  customers: "Customers",
  finance: "Finance",
  "cash-sessions": "Cash drawer",
  credit: "Credit",
  expenses: "Expenses",
  banking: "Banking",
  reports: "Reports",
  settings: "Settings",
  outlets: "Outlets",
  users: "Users",
  general: "General",
};

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const crumbs: { href: string; label: string }[] = [];
  let path = "";
  for (const seg of segments) {
    path += `/${seg}`;
    const label = LABELS[seg] ?? seg.replace(/-/g, " ");
    crumbs.push({ href: path, label });
  }

  if (crumbs.length === 0) {
    return (
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">POS</span>
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      <Link href="/pos" className="text-muted-foreground hover:text-foreground">
        POS
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1">
          <ChevronRight className="size-3.5 text-muted-foreground" />
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-foreground capitalize">
              {c.label}
            </span>
          ) : (
            <Link
              href={c.href}
              className="text-muted-foreground capitalize hover:text-foreground"
            >
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
