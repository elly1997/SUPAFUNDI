"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { KeyRound, LogOut, Menu, Search, User } from "lucide-react";
import { toast } from "sonner";
import { performSignOut } from "@/lib/auth/sign-out-client";
import { canSwitchOutlets } from "@/lib/auth/roles";
import { redeemOutletAccessOtp } from "@/lib/actions/outlet-access";
import { useSwitchOutlet } from "@/hooks/use-switch-outlet";
import { resolveActiveOutletId } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { AppBreadcrumbs } from "@/components/layout/app-breadcrumbs";
import { ContextBar } from "@/components/layout/context-bar";
import { filterNavForRole } from "@/components/layout/nav-config";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";

type OutletOption = {
  id: string;
  name: string;
  code?: string | null;
  is_default?: boolean;
};

type AppHeaderProps = {
  outlets: OutletOption[];
};

export function AppHeader({ outlets }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [signOutPending, startSignOut] = useTransition();
  const { switchOutlet, pending: outletPending } = useSwitchOutlet();
  const pending = signOutPending || outletPending;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const session = useAuthStore((s) => s.session);
  const activeOutletId = useAuthStore((s) => s.activeOutletId);

  if (!session) {
    return null;
  }

  const displayName = session.fullName || session.email;
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

  const onRedeemCode = async () => {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      toast.error("Enter the 6-digit code from the owner.");
      return;
    }
    setRedeeming(true);
    try {
      const res = await redeemOutletAccessOtp(trimmed);
      if (res.ok) {
        toast.success(`Access granted to ${res.outletName}.`);
        setCode("");
        setCodeOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } finally {
      setRedeeming(false);
    }
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

  return (
    <div className="flex shrink-0 flex-col">
      <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!isPos ? (
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
          ) : null}
          <AppBreadcrumbs />
        </div>
        <div className="hidden max-w-xs flex-1 lg:flex">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search products, sales…"
              className="h-9 w-full rounded-lg border border-input bg-muted/40 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled
              title="Global search coming soon"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <User className="size-4" />
            <span className="max-w-[8rem] truncate" title={displayName}>
              {displayName}
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs capitalize">
              {session.role.replace("_", " ")}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCodeOpen(true)}
            title="Redeem an outlet access code from the owner"
          >
            <KeyRound className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Access code</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSignOut}
            disabled={pending}
          >
            <LogOut className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      {!isPos && outlets.length > 0 ? (
        <ContextBar
          outlets={outlets}
          outletId={outletValue}
          onOutletChange={onOutletChange}
          outletChangeDisabled={pending}
          canSwitchOutlet={canSwitch}
        />
      ) : null}

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Redeem outlet access code</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code the owner shared with you to unlock access
              to your assigned outlet.
            </p>
            <Input
              inputMode="numeric"
              autoFocus
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !redeeming) onRedeemCode();
              }}
              className="text-center text-2xl font-mono tracking-[0.3em]"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={redeeming || code.trim().length !== 6}
              onClick={onRedeemCode}
            >
              {redeeming ? "Unlocking…" : "Unlock outlet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Menu</DialogTitle>
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
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-muted"
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
