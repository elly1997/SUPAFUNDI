"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchCustomerStatement,
  fetchSupplierStatement,
} from "@/lib/api/party-statements-fetch";
import { formatTzs, formatDateEAT } from "@/lib/utils/currency";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyType: "supplier" | "customer";
  partyId: string | null;
  partyName: string;
};

export function PartyStatementDialog({
  open,
  onOpenChange,
  partyType,
  partyId,
  partyName,
}: Props) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["party-statement", partyType, partyId],
    enabled: open && !!partyId,
    queryFn: () =>
      partyType === "supplier"
        ? fetchSupplierStatement(partyId!)
        : fetchCustomerStatement(partyId!),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {partyType === "supplier" ? "Supplier" : "Customer"} statement —{" "}
            {partyName}
          </DialogTitle>
          {partyType === "customer" ? (
            <p className="text-sm text-muted-foreground">
              Credit balance (debit/credit) and prepaid deposit (Deposit ± /
              Dep. balance). Deposit dates show when money was recorded.
            </p>
          ) : null}
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Method</TableHead>
                {partyType === "customer" ? (
                  <>
                    <TableHead className="text-right">Deposit in/out</TableHead>
                    <TableHead className="text-right">Prepaid bal.</TableHead>
                  </>
                ) : null}
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {l.date ? formatDateEAT(`${l.date}T12:00:00.000Z`) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{l.type}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">
                    {l.reference}
                  </TableCell>
                  <TableCell className="text-xs capitalize">
                    {l.payment_method ?? "—"}
                  </TableCell>
                  {partyType === "customer" ? (
                    <>
                      <TableCell className="text-right font-money text-xs">
                        {l.deposit_delta != null && l.deposit_delta !== 0
                          ? `${l.deposit_delta > 0 ? "+" : "−"}${formatTzs(Math.abs(l.deposit_delta))}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-money text-xs text-inflow">
                        {l.deposit_balance != null
                          ? formatTzs(l.deposit_balance)
                          : "—"}
                      </TableCell>
                    </>
                  ) : null}
                  <TableCell className="text-right font-money text-xs">
                    {l.debit > 0 ? formatTzs(l.debit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-money text-xs text-inflow">
                    {l.credit > 0 ? formatTzs(l.credit) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-money text-xs font-semibold">
                    {formatTzs(l.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
