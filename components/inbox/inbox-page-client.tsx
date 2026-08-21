"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Ban,
  Inbox,
  Loader2,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  actOnInboxTransfer,
  actOnInboxVoid,
  listInboxItems,
  type InboxKind,
} from "@/lib/actions/inbox";
import { cn } from "@/lib/utils";
import { formatDateTimeEAT } from "@/lib/utils/currency";

const FILTERS: { id: "all" | InboxKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "transfer_approval", label: "Transfers" },
  { id: "void_receipt", label: "Void requests" },
  { id: "void_done", label: "Voided" },
  { id: "reconciliation", label: "Reconcile" },
];

function kindIcon(kind: InboxKind) {
  if (kind === "transfer_approval") return ArrowLeftRight;
  if (kind === "void_receipt" || kind === "void_done") return Ban;
  return Scale;
}

export function InboxPageClient() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | InboxKind>("all");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["inbox"],
    queryFn: listInboxItems,
    refetchInterval: 30_000,
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "all") return all;
    return all.filter((i) => i.kind === filter);
  }, [data, filter]);

  const counts = useMemo(() => {
    const all = data?.items ?? [];
    return {
      all: all.length,
      transfer_approval: all.filter((i) => i.kind === "transfer_approval").length,
      void_receipt: all.filter((i) => i.kind === "void_receipt").length,
      void_done: all.filter((i) => i.kind === "void_done").length,
      reconciliation: all.filter((i) => i.kind === "reconciliation").length,
    };
  }, [data]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
    void queryClient.invalidateQueries({ queryKey: ["sales-list"] });
    void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["drawer-status"] });
    void queryClient.invalidateQueries({ queryKey: ["reports"] });
  };

  const transferMut = useMutation({
    mutationFn: actOnInboxTransfer,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transfer approved and sent");
        invalidate();
      } else toast.error(r.message);
    },
  });

  const voidMut = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "approve" | "reject";
    }) => actOnInboxVoid(id, action),
    onSuccess: (r, vars) => {
      if (r.ok) {
        toast.success(
          vars.action === "approve" ? "Receipt voided" : "Void request declined"
        );
        invalidate();
      } else toast.error(r.message);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Approvals, voided receipts, and days that still need closing — all outlets. Owner and managers only."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Refresh
          </Button>
        }
      />

      {(data?.warnings?.length ?? 0) > 0 ? (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="space-y-1 py-3 text-sm text-warning">
            {data!.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {f.label}
            {counts[f.id] > 0 ? (
              <span className="ml-1.5 text-xs opacity-80">({counts[f.id]})</span>
            ) : null}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center text-sm">
            <p className="text-destructive">
              Could not load inbox
              {error instanceof Error ? `: ${error.message}` : "."}
            </p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Inbox className="size-8 text-muted-foreground/70" />
            {filter === "void_receipt" ? (
              <>
                No pending void requests. Cashiers use <strong>Request void</strong>{" "}
                on a sale; those appear here for approve/decline.
              </>
            ) : filter === "void_done" ? (
              <>No voided receipts in the last 14 days for this organization.</>
            ) : filter === "reconciliation" ? (
              <>
                No unreconciled days in the last 45 days. Days with completed sales
                or expenses that are not marked reconciled will show here.
              </>
            ) : (
              <>
                Nothing waiting. Staff void requests, recent voids, transfers, and
                unreconciled days appear here.
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = kindIcon(item.kind);
            const busy = transferMut.isPending || voidMut.isPending;
            return (
              <Card key={item.id} className="border-border">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Icon className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{item.title}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">{item.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.outletName}
                      {item.kind !== "reconciliation"
                        ? ` · ${formatDateTimeEAT(item.createdAt)}`
                        : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.kind === "transfer_approval" ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => transferMut.mutate(item.referenceId)}
                        >
                          Approve & send
                        </Button>
                        <Link
                          href={item.href}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" })
                          )}
                        >
                          View
                        </Link>
                      </>
                    ) : null}
                    {item.kind === "void_receipt" ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            voidMut.mutate({
                              id: item.referenceId,
                              action: "approve",
                            })
                          }
                        >
                          Approve void
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            voidMut.mutate({
                              id: item.referenceId,
                              action: "reject",
                            })
                          }
                        >
                          Decline
                        </Button>
                        <Link
                          href={item.href}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" })
                          )}
                        >
                          Receipt
                        </Link>
                      </>
                    ) : null}
                    {item.kind === "void_done" ? (
                      <Link
                        href={item.href}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        View receipt
                      </Link>
                    ) : null}
                    {item.kind === "reconciliation" ? (
                      <Link
                        href={item.href}
                        className={cn(buttonVariants({ size: "sm" }))}
                      >
                        Open closing
                      </Link>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
