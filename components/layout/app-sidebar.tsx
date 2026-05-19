"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  filterNavForRole,
  isNavItemActive,
  isNavSectionActive,
  type NavSection,
} from "@/components/layout/nav-config";
import {
  isNavSectionOpen,
  useSettingsStore,
} from "@/stores/settingsStore";
import { useAuthStore } from "@/stores/authStore";

function NavSectionBlock({
  section,
  collapsed,
  pathname,
}: {
  section: NavSection;
  collapsed: boolean;
  pathname: string;
}) {
  const navExpanded = useSettingsStore((s) => s.navExpanded);
  const toggleNavSection = useSettingsStore((s) => s.toggleNavSection);

  const sectionActive = isNavSectionActive(pathname, section.items);
  const userOpen = isNavSectionOpen(
    section.id,
    section.defaultOpen ?? true,
    navExpanded
  );
  const open = section.collapsible
    ? userOpen || sectionActive
    : true;

  return (
    <div className="mb-1">
      {section.title && !collapsed && (
        <button
          type="button"
          onClick={() =>
            section.collapsible ? toggleNavSection(section.id) : undefined
          }
          className={cn(
            "mb-1 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide",
            sectionActive
              ? "text-sidebar-primary"
              : "text-sidebar-foreground/60"
          )}
          aria-expanded={section.collapsible ? open : undefined}
        >
          <span>{section.title}</span>
          {section.collapsible ? (
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                open ? "rotate-0" : "-rotate-90"
              )}
            />
          ) : null}
        </button>
      )}
      <ul
        className={cn(
          "space-y-0.5",
          section.collapsible && !open && !collapsed && "hidden"
        )}
      >
        {section.items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active && "text-sidebar-primary"
                  )}
                />
                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.session?.role);
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const setCollapsed = useSettingsStore((s) => s.setSidebarCollapsed);

  if (!role) {
    return null;
  }

  const sections = filterNavForRole(role);

  return (
    <aside
      className={cn(
        "hidden h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.25rem]" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-3">
        {!collapsed && (
          <Link href="/" className="truncate text-sm font-semibold text-white">
            HardwarePOS
          </Link>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((section) => (
          <NavSectionBlock
            key={section.id}
            section={section}
            collapsed={collapsed}
            pathname={pathname}
          />
        ))}
      </nav>
    </aside>
  );
}
