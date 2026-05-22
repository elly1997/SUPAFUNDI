"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { canManageSettings } from "@/lib/auth/roles";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  grnId: string;
  referenceLabel: string;
  onVoided?: () => void;
};

export function GrnVoidButton({ grnId, referenceLabel, onVoided }: Props) {
  const role = useAuthStore((s) => s.session?.role ?? null);
  const queryClient = useQueryClient();

  const voidMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/inventory/grn/void", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grnId }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "Void receipt failed");
      }
      return data;
    },
    onSuccess: () => {
      toast.success(`Receipt ${referenceLabel} voided`);
      void queryClient.invalidateQueries({ queryKey: ["item-statement"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-catalog"] });
      onVoided?.();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  if (!canManageSettings(role)) return null;

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      className="h-7 rounded-md px-2 text-xs"
      disabled={voidMut.isPending}
      onClick={() => {
        if (
          !window.confirm(
            `Void goods receipt ${referenceLabel}? This reverses stock, accounting, and any unpaid supplier bill for this receipt.`
          )
        ) {
          return;
        }
        voidMut.mutate();
      }}
    >
      {voidMut.isPending ? (
        <Loader2 className="mr-1 size-3 animate-spin" />
      ) : (
        <Ban className="mr-1 size-3" />
      )}
      Void
    </Button>
  );
}
