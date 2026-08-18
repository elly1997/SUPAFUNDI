"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Loader2, PackageCheck } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listIncomingStockTransfers,
  receiveStockTransfer,
} from "@/lib/actions/transfers";
import { cn } from "@/lib/utils";
import { formatDateTimeEAT } from "@/lib/utils/currency";

type Props = {
  outletId: string | null;
  compact?: boolean;
};

export function IncomingTransfersPanel({ outletId, compact = false }: Props) {
  const queryClient = useQueryClient();
  const { data: incoming = [], isLoading } = useQuery({
    queryKey: ["incoming-transfers", outletId],
    queryFn: () => listIncomingStockTransfers(outletId!),
    enabled: !!outletId,
  });

  const receiveMut = useMutation({
    mutationFn: receiveStockTransfer,
    onSuccess: (r, transferId) => {
      if (r.ok) {
        toast.success("Transfer received into stock");
        queryClient.invalidateQueries({ queryKey: ["incoming-transfers"] });
        queryClient.invalidateQueries({ queryKey: ["stock-transfers"] });
        queryClient.invalidateQueries({ queryKey: ["stock-levels"] });
        queryClient.invalidateQueries({ queryKey: ["stock-transfer", transferId] });
        queryClient.invalidateQueries({ queryKey: ["product-price-catalog"] });
        queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      } else toast.error(r.message);
    },
  });

  if (!outletId || isLoading || incoming.length === 0) return null;

  if (compact) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-primary">
            <PackageCheck className="size-4" />
            {incoming.length} incoming transfer(s) awaiting receipt
          </span>
          <Link
            href="/inventory/receive"
            className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
          >
            Review & receive
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageCheck className="size-5 text-primary" />
          Incoming stock transfers — confirm receipt
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Confirm receipt to add these items to this outlet&apos;s catalog and
          stock. Matching SKU, barcode, or name is reused; new items are copied
          here.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {incoming.map((tr) => (
          <div
            key={tr.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {tr.reference_no ?? "Transfer"} · {tr.item_count} item(s)
              </p>
              <p className="text-xs text-muted-foreground">
                From {tr.from_outlet_name ?? "—"} ·{" "}
                {formatDateTimeEAT(tr.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href={`/inventory/transfers/${tr.id}`}
                className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
              >
                <ArrowLeftRight className="mr-1 size-3.5" />
                View
              </Link>
              <Button
                type="button"
                size="sm"
                disabled={receiveMut.isPending}
                onClick={() => receiveMut.mutate(tr.id)}
              >
                {receiveMut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Confirm received"
                )}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
