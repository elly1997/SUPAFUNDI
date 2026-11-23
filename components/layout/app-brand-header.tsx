"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import {
  LogOut,
  Menu,
  Store,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppNavTabs } from "@/components/layout/app-nav-tabs";
import { PosModuleNav } from "@/components/layout/pos-module-nav";
import { BrandLogo } from "@/components/layout/brand-logo";
import { InboxButton } from "@/components/layout/inbox-button";
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
import { performSignOut } from "@/lib/auth/sign-out-client";
import { canSwitchOutlets } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { useSwitchOutlet } from "@/hooks/use-switch-outlet";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";
import { useGuardedBusinessDate } from "@/hooks/use-guarded-business-date";

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
  const [signOutPending, startSignOut] = useTransition();
  const { switchOutlet, pending: outletPending } = useSwitchOutlet();
  const pending = signOutPending || outletPending;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const session = useAuthStore((s) => s.session);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);
  const { businessDate, onBusinessDateChange, reconciledDates } =
    useGuardedBusinessDate();

  if (!session) {
    return null;
  }

  const displayName = session.fullName || session.email;
  const shortName = displayName.split(" ")[0] || displayName;
  const canSwitch = canSwitchOutlets(session.role);
  const outletValue =
    resolveActiveOutletId(outlets, {
      stored: activeOutletId,
      profileOutletId: session.outletId,
    }) ?? "";
  const mobileSections = filterNavForRole(session.role);
  const isPos = pathname === "/pos" || pathname.startsWith("/pos/");

  const onOutletChange = (outletId: string) => {
    if (!canSwitch) return;
    switchOutlet(outletId);
  };

  const onSignOut = () => {
    startSignOut(async () => {
      try {
        await performSignOut();
        router.replace("/login");
        router.refresh();
      } catch {
        toast.error("Sign out failed");
      }
    });
  };

  /** POS counter mode: one dense bar — brand + modules + date + actions. */
  if (isPos) {
    return (
      <div className="flex shrink-0 flex-col">
        <header className="sticky top-0 z-30 flex h-11 items-center gap-1.5 border-b border-border bg-header px-2 md:gap-2 md:px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>

          <BrandLogo compact showTagline={false} href="/pos" />

          <div className="hidden min-w-0 flex-1 md:block">
            <PosModuleNav compact className="border-0 bg-transparent px-0 py-0" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-1.5">
            <DatePicker
              value={businessDate}
              onChange={onBusinessDateChange}
              disabledDates={reconciledDates}
              showPresets
              buttonClassName="h-8 min-w-0 max-w-[9.5rem] px-2 text-[11px]"
            />
            <InboxButton compact />
            <span
              className="hidden max-w-[5.5rem] truncate text-xs font-medium text-muted-foreground lg:inline"
              title={displayName}
            >
              {shortName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-border bg-surface-1 px-2"
              onClick={onSignOut}
              disabled={pending}
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
              <span className="ml-1 hidden sm:inline text-xs">Out</span>
            </Button>
          </div>
        </header>

        {/* Mobile-only module strip — desktop embeds modules in the header */}
        <div className="md:hidden">
          <PosModuleNav compact />
        </div>

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

  return (
    <div className="flex shrink-0 flex-col">
      <header className="sticky top-0 z-30 flex h-11 items-center gap-1.5 border-b border-border bg-header px-2 md:gap-2 md:px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 md:hidden"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-4" />
        </Button>

        <BrandLogo compact showTagline={false} className="min-w-0 shrink" />

        {outlets.length > 0 ? (
          <label className="hidden min-w-0 max-w-[10rem] items-center gap-1 rounded-lg border border-border bg-surface-1 px-2 py-1 text-xs sm:inline-flex">
            <Store className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {canSwitch ? (
              <select
                value={outletValue}
                disabled={pending || outlets.length === 0}
                onChange={(e) => onOutletChange(e.target.value)}
                className="min-w-0 flex-1 truncate border-0 bg-transparent py-0 text-xs font-medium text-foreground focus:outline-none focus:ring-0"
                aria-label="Active outlet"
              >
                {outlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="min-w-0 flex-1 truncate py-0 text-xs font-medium text-foreground">
                {outlets.find((o) => o.id === outletValue)?.name ?? "Outlet"}
              </span>
            )}
          </label>
        ) : null}

        <DatePicker
          value={businessDate}
          onChange={onBusinessDateChange}
          disabledDates={reconciledDates}
          showPresets
          buttonClassName="h-8 min-w-0 max-w-[9.5rem] px-2 text-[11px]"
        />

        <div className="ml-auto flex items-center gap-1 md:gap-1.5">
          <Link
            href="/daily-closing"
            className={cn(
              buttonVariants({ size: "sm" }),
              "btn-reconcile hidden h-8 border-0 px-2.5 text-xs sm:inline-flex"
            )}
          >
            Reconcile
          </Link>
          <Link
            href="/daily-closing"
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "hidden h-8 px-2 text-xs lg:inline-flex"
            )}
          >
            <Wallet className="mr-1 size-3.5" />
            Closing
          </Link>
          <InboxButton compact />
          <LiveClock />
          <SyncBadge state="synced" />
          <span
            className="hidden max-w-[5.5rem] truncate text-xs font-medium text-muted-foreground lg:inline"
            title={displayName}
          >
            {shortName}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-border bg-surface-1 px-2"
            onClick={onSignOut}
            disabled={pending}
            aria-label="Sign out"
          >
            <LogOut className="size-3.5" />
            <span className="ml-1 hidden sm:inline text-xs">Out</span>
          </Button>
        </div>
      </header>

      <AppNavTabs />

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
