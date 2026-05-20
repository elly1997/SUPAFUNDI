"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import {
  LogOut,
  Menu,
  Store,
  User,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppNavTabs } from "@/components/layout/app-nav-tabs";
import { PosModuleNav } from "@/components/layout/pos-module-nav";
import { BrandLogo } from "@/components/layout/brand-logo";
import { LiveClock } from "@/components/layout/live-clock";
import { SyncBadge } from "@/components/layout/sync-badge";
import { filterNavForRole } from "@/components/layout/nav-config";
import { Button, buttonVariants } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateActiveOutlet, signOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";
import { useBusinessDateStore } from "@/stores/businessDateStore";

type OutletOption = {
  id: string;
  name: string;
  code?: string | null;
  is_default?: boolean;
};

type AppBrandHeaderProps = {
  outlets: OutletOption[];
};

export function AppBrandHeader({ outlets }: AppBrandHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = useAuthStore((s) => s.session);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId);
  const businessDate = useBusinessDateStore((s) => s.businessDate);

  if (!session) {
    return null;
  }

  const displayName = session.fullName || session.email;
  const outletValue =
    resolveActiveOutletId(outlets, {
      stored: activeOutletId,
      profileOutletId: session.outletId,
    }) ?? "";
  const mobileSections = filterNavForRole(session.role);
  const isPos = pathname === "/pos" || pathname.startsWith("/pos/");

  const onOutletChange = (outletId: string) => {
    setActiveOutletId(outletId);
    startTransition(async () => {
      const res = await updateActiveOutlet(outletId);
      if (res.ok) {
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="flex shrink-0 flex-col">
      <header
        className={cn(
          "sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-header px-3 md:px-4",
          isPos ? "py-1.5" : "gap-3 py-2"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>

        <BrandLogo className="min-w-0 flex-1 md:flex-none" />

        {outlets.length > 0 && !isPos ? (
          <label className="inline-flex min-w-0 max-w-[11rem] items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2 py-1 text-sm">
            <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <select
              value={outletValue}
              disabled={pending || outlets.length === 0}
              onChange={(e) => onOutletChange(e.target.value)}
              className="min-w-0 flex-1 truncate border-0 bg-transparent py-0 text-sm font-medium text-foreground focus:outline-none focus:ring-0"
              aria-label="Active outlet"
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!isPos ? (
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/daily-closing"
              className={cn(
                buttonVariants({ size: "sm" }),
                "btn-reconcile h-8 border-0 px-3"
              )}
            >
              Reconcile
            </Link>
            <Link
              href="/finance/cash-sessions"
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "h-8"
              )}
            >
              <Wallet className="mr-1.5 size-4" />
              Open session
            </Link>
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {!isPos ? <LiveClock /> : null}
          {!isPos ? <SyncBadge state="synced" /> : null}
          <span className="hidden items-center gap-1.5 text-sm text-muted-foreground md:inline-flex">
            <User className="size-4 shrink-0" aria-hidden />
            <span
              className="max-w-[7rem] truncate font-medium text-foreground"
              title={displayName}
            >
              {displayName}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-border bg-surface-1"
            onClick={() => startTransition(() => void signOut())}
            disabled={pending}
          >
            <LogOut className="size-4 sm:mr-1" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b border-border bg-background/80 px-3 text-sm md:px-4",
          isPos ? "py-1.5" : "py-1.5"
        )}
      >
        <DatePicker
          value={businessDate}
          onChange={(iso) =>
            useBusinessDateStore.getState().setBusinessDate(iso)
          }
          showPresets
          className="sm:hidden"
          buttonClassName="h-8 min-w-[8.5rem] text-xs"
        />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {session.organizationName ?? "SUPAFUNDI TRADERS"}
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">·</span>
        <DatePicker
          value={businessDate}
          onChange={(iso) =>
            useBusinessDateStore.getState().setBusinessDate(iso)
          }
          showPresets
          className="hidden sm:inline-block"
          buttonClassName="h-8 min-w-[10rem] text-xs"
        />
        <Link
          href="/daily-closing"
          className={cn(
            buttonVariants({ size: "sm" }),
            "btn-reconcile ml-auto h-7 border-0 px-2 text-xs sm:hidden"
          )}
        >
          Reconcile
        </Link>
      </div>

      {isPos ? <PosModuleNav /> : <AppNavTabs />}

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>All modules</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-4">
            {mobileSections.map((section) => (
              <div key={section.id}>
                {section.title ? (
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    {section.title}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className="block rounded-lg px-3 py-2.5 text-sm hover:bg-secondary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </div>
  );
}
