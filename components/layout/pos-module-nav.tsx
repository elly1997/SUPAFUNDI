"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  filterPrimaryNavForRole,
  isNavItemActive,
  type NavItem,
} from "@/components/layout/nav-config";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const POS_MODULE_HREFS = new Set([
  "/",
  "/pos",
  "/sales",
  "/inventory/products",
  "/inventory/stock",
  "/reports",
]);

function pickPosModules(tabs: NavItem[]): NavItem[] {
  const picked = tabs.filter((t) => POS_MODULE_HREFS.has(t.href));
  const pos = picked.find((t) => t.href === "/pos");
  const rest = picked.filter((t) => t.href !== "/pos");
  return pos ? [pos, ...rest] : picked;
}

type Props = {
  className?: string;
};

export function PosModuleNav({ className }: Props) {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.session?.role);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!role) return null;

  const allTabs = filterPrimaryNavForRole(role);
  const modules = pickPosModules(allTabs);
  const moduleHrefs = new Set(modules.map((m) => m.href));
  const overflow = allTabs.filter((t) => !moduleHrefs.has(t.href));

  return (
    <>
      <nav
        className={cn(
          "flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-header/90 px-2 py-1.5 scrollbar-thin",
          className
        )}
        aria-label="Module navigation"
      >
        {modules.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={cn(
                "nav-tab shrink-0 px-2.5 py-1.5 text-xs sm:text-sm",
                active && "nav-tab-active"
              )}
            >
              <Icon className="size-3.5 sm:size-4" strokeWidth={2} aria-hidden />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {overflow.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-8 shrink-0 gap-1 rounded-lg px-2 text-xs"
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal className="size-4" />
            More
          </Button>
        ) : null}
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>All modules</DialogTitle>
          </DialogHeader>
          <ul className="grid gap-1 sm:grid-cols-2">
            {allTabs.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted",
                      active && "bg-primary/15 text-primary"
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
