"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { canManageSettings } from "@/lib/auth/roles";
import { voidSale } from "@/lib/actions/sales";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

type Props = {
  saleId: string;
  invoiceNo: string;
  status: string;
  /** Compact row action for sales list tables. */
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
  const role = useAuthStore((s) => s.session?.role ?? null);

  const voidMut = useMutation({
    mutationFn: () => voidSale(saleId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Sale ${invoiceNo} voided`);
        void queryClient.invalidateQueries({ queryKey: ["sales-list"] });
        onVoided?.();
        router.refresh();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  if (status !== "completed" || !canManageSettings(role)) return null;

  return (
    <Button
      type="button"
      variant="destructive"
      size={compact ? "sm" : "default"}
      className={cn(compact ? "rounded-md px-3 text-xs" : "rounded-xl")}
      disabled={voidMut.isPending}
      onClick={() => {
        if (
          !window.confirm(
            `Void sale ${invoiceNo}? This reverses stock, returns any deposit or cash applied on that invoice to the customer prepaid balance, and updates credit.`
          )
        ) {
          return;
        }
        voidMut.mutate();
      }}
    >
      {voidMut.isPending ? (
        <Loader2
          className={cn("animate-spin", compact ? "mr-1 size-3" : "mr-2 size-4")}
        />
      ) : (
        <Ban className={cn(compact ? "mr-1 size-3" : "mr-2 size-4")} />
      )}
      {compact ? "Void" : "Void sale"}
    </Button>
  );
}
