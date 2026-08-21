"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canManageSettings,
  canRequestSaleVoid,
  isUserRole,
} from "@/lib/auth/roles";
import { voidSale } from "@/lib/actions/sales";
import { requestSaleVoid } from "@/lib/actions/void-requests";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

type Props = {
  saleId: string;
  invoiceNo: string;
  status: string;
  compact?: boolean;
  onVoided?: () => void;
};

export function SaleVoidActions({
  saleId,
  invoiceNo,
  status,
  compact = false,
  onVoided,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const roleRaw = useAuthStore((s) => s.session?.role ?? null);
  const role = isUserRole(roleRaw ?? "") ? roleRaw : null;
  const canVoidNow = canManageSettings(role);
  const canRequest = canRequestSaleVoid(role);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reason, setReason] = useState("");

  const voidMut = useMutation({
    mutationFn: () => voidSale(saleId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Sale ${invoiceNo} voided`);
        void queryClient.invalidateQueries({ queryKey: ["sales-list"] });
        void queryClient.invalidateQueries({ queryKey: ["inbox"] });
        void queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
        void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["drawer-status"] });
        void queryClient.invalidateQueries({ queryKey: ["reports"] });
        onVoided?.();
        router.refresh();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  const requestMut = useMutation({
    mutationFn: () => requestSaleVoid({ saleId, reason }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Void request sent to owner/manager inbox");
        setRequestOpen(false);
        setReason("");
        void queryClient.invalidateQueries({ queryKey: ["inbox-count"] });
      } else toast.error(r.message);
    },
  });

  if (status !== "completed") return null;
  if (!canVoidNow && !canRequest) return null;

  return (
    <>
      {canVoidNow ? (
        <Button
          type="button"
          variant="destructive"
          size={compact ? "sm" : "default"}
          className={cn(compact ? "rounded-md px-3 text-xs" : "rounded-xl")}
          disabled={voidMut.isPending}
          onClick={() => {
            if (
              !window.confirm(
                `Void sale ${invoiceNo}? This reverses stock, payments, and credit for this outlet only.`
              )
            ) {
              return;
            }
            voidMut.mutate();
          }}
        >
          {voidMut.isPending ? (
            <Loader2
              className={cn(
                "animate-spin",
                compact ? "mr-1 size-3" : "mr-2 size-4"
              )}
            />
          ) : (
            <Ban className={cn(compact ? "mr-1 size-3" : "mr-2 size-4")} />
          )}
          {compact ? "Void" : "Void sale"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn(compact ? "rounded-md px-3 text-xs" : "rounded-xl")}
          onClick={() => setRequestOpen(true)}
        >
          <Ban className={cn(compact ? "mr-1 size-3" : "mr-2 size-4")} />
          {compact ? "Request void" : "Request void"}
        </Button>
      )}

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request void {invoiceNo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why should this receipt be voided?"
              rows={3}
            />
            <p className="form-hint text-xs text-muted-foreground">
              Owner or manager will see this in Inbox and must approve before
              stock and payments reverse.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={requestMut.isPending || reason.trim().length < 3}
              onClick={() => requestMut.mutate()}
            >
              {requestMut.isPending ? "Sending…" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
