"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartyStatementDialog } from "@/components/finance/party-statement-dialog";
import { RecordPartyPaymentDialog } from "@/components/finance/record-party-payment-dialog";

type Props = {
  customerId: string;
  customerName: string;
  outstandingBalance: number;
};

export function CustomerDetailActions({
  customerId,
  customerName,
  outstandingBalance,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["customers"] });
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={outstandingBalance <= 0}
          onClick={() => setPayOpen(true)}
        >
          <Wallet className="mr-2 size-4" />
          Record payment
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setStmtOpen(true)}
        >
          <FileText className="mr-2 size-4" />
          Statement
        </Button>
      </div>
      <RecordPartyPaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        partyType="customer"
        partyId={customerId}
        partyName={customerName}
        maxAmount={outstandingBalance}
        onSuccess={refresh}
      />
      <PartyStatementDialog
        open={stmtOpen}
        onOpenChange={setStmtOpen}
        partyType="customer"
        partyId={customerId}
        partyName={customerName}
      />
    </>
  );
}
