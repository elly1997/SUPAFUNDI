"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { canManageSettings } from "@/lib/auth/roles";
import { voidExpense } from "@/lib/actions/expenses";
import { formatExpenseCategoryLabel } from "@/lib/constants/expense-categories";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

type Props = {
  expenseId: string;
  category: string | null;
  description: string | null;
  amount: number;
  expenseDate: string;
  compact?: boolean;
  onVoided?: () => void;
};

export function ExpenseVoidActions({
  expenseId,
  category,
  description,
  amount,
  expenseDate,
  compact = false,
  onVoided,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.session?.role ?? null);

  const voidMut = useMutation({
    mutationFn: () => voidExpense(expenseId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Expense voided — re-record as To bank if this was a deposit");
        void queryClient.invalidateQueries({ queryKey: ["expenses"] });
        void queryClient.invalidateQueries({ queryKey: ["day-cash-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-expenses"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-bank-deposits"] });
        onVoided?.();
        router.refresh();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  if (!canManageSettings(role)) return null;

  const label = formatExpenseCategoryLabel(category ?? "misc");
  const detail = description?.trim() || "No description";

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
            `Void this expense?\n\n${label} · ${formatTzs(amount)} · ${expenseDate}\n${detail}\n\nThis reverses the journal entry. If this was cash moved to the bank, use POS → Cash out → To bank to record it correctly.`
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
      {compact ? "Void" : "Void expense"}
    </Button>
  );
}
