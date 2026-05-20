"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { voidSale } from "@/lib/actions/sales";

type Props = {
  saleId: string;
  invoiceNo: string;
  status: string;
};

export function SaleVoidActions({ saleId, invoiceNo, status }: Props) {
  const router = useRouter();

  const voidMut = useMutation({
    mutationFn: () => voidSale(saleId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Sale ${invoiceNo} voided`);
        router.refresh();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Void failed"),
  });

  if (status !== "completed") return null;

  return (
    <Button
      type="button"
      variant="destructive"
      className="rounded-xl"
      disabled={voidMut.isPending}
      onClick={() => {
        if (
          !window.confirm(
            `Void sale ${invoiceNo}? This reverses the journal entry and restores stock.`
          )
        ) {
          return;
        }
        voidMut.mutate();
      }}
    >
      {voidMut.isPending ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Ban className="mr-2 size-4" />
      )}
      Void sale
    </Button>
  );
}
