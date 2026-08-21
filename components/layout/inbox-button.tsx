"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { canAccessInbox, isUserRole } from "@/lib/auth/roles";
import { getInboxOpenCount } from "@/lib/actions/inbox";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

export function InboxButton({ compact = false }: { compact?: boolean }) {
  const roleRaw = useAuthStore((s) => s.session?.role ?? null);
  const role = isUserRole(roleRaw ?? "") ? roleRaw : null;
  const queryClient = useQueryClient();

  const { data: count = 0 } = useQuery({
    queryKey: ["inbox-count"],
    queryFn: getInboxOpenCount,
    enabled: canAccessInbox(role),
    refetchInterval: 60_000,
  });

  if (!canAccessInbox(role)) return null;

  return (
    <Link
      href="/inbox"
      onClick={() => {
        void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      }}
      className={cn(
        "relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 text-sm font-medium text-foreground hover:bg-muted",
        compact && "px-2"
      )}
      aria-label={count > 0 ? `Inbox, ${count} open` : "Inbox"}
    >
      <Inbox className="size-4" />
      <span className="hidden sm:inline">Inbox</span>
      {count > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
