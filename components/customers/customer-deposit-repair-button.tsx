"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { repairCustomerDepositBalance } from "@/lib/actions/customers";
import { formatTzs } from "@/lib/utils/currency";

type Props = { customerId: string };

export function CustomerDepositRepairButton({ customerId }: Props) {
  const router = useRouter();
  const mut = useMutation({
    mutationFn: () => repairCustomerDepositBalance(customerId),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      toast.success(
        r.previous === r.next
          ? "Deposit balance already matched"
          : `Deposit fixed: ${formatTzs(r.previous)} → ${formatTzs(r.next)}`
      );
      router.refresh();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Repair failed"),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={mut.isPending}
      onClick={() => mut.mutate()}
    >
      {mut.isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Wrench className="mr-2 size-4" />
      )}
      Fix deposit balance
    </Button>
  );
}
