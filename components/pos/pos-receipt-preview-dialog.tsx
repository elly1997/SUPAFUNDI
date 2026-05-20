"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import type { PaymentMethod } from "@/components/pos/pos-payment-chips";
import { formatTzs } from "@/lib/utils/currency";

export type ReceiptPreviewLine = {
  name: string;
  code?: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerLabel: string;
  lines: ReceiptPreviewLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  onPrint: () => void;
  onConfirm: () => void;
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  bank_transfer: "Bank",
  credit_account: "On account",
  cheque: "Cheque",
};

export function PosReceiptPreviewDialog({
  open,
  onOpenChange,
  customerLabel,
  lines,
  subtotal,
  discountAmount,
  taxAmount,
  total,
  taxRate,
  paymentMethod,
  amountPaid,
  onPrint,
  onConfirm,
}: Props) {
  const balanceDue = Math.max(0, total - amountPaid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-4 py-4">
          <DialogTitle>Review sale receipt</DialogTitle>
          <DialogDescription>
            Check items and totals. Print the receipt first, then complete the
            sale if everything is correct.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-sm">
            <span className="text-muted-foreground">Customer: </span>
            <span className="font-medium text-foreground">{customerLabel}</span>
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={`${l.name}-${i}`}>
                    <TableCell>
                      <p className="font-medium text-foreground">{l.name}</p>
                      {l.code ? (
                        <p className="font-mono text-xs text-muted-foreground">
                          {l.code}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.quantity} {l.unit}
                    </TableCell>
                    <TableCell className="text-right font-money text-sm tabular-nums">
                      {formatTzs(l.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-money font-semibold tabular-nums">
                      {formatTzs(l.lineTotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-money tabular-nums">{formatTzs(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-outflow">
                <span>Discount</span>
                <span className="tabular-nums">-{formatTzs(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT ({taxRate}%)</span>
              <span className="tabular-nums">{formatTzs(taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-money text-primary tabular-nums">
                {formatTzs(total)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Payment ({PAYMENT_LABELS[paymentMethod]})</span>
              <span className="font-money tabular-nums">{formatTzs(amountPaid)}</span>
            </div>
            {balanceDue > 0 && (
              <div className="flex justify-between text-warning">
                <span>Balance due</span>
                <span className="font-money tabular-nums">{formatTzs(balanceDue)}</span>
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 border-t bg-muted/20 p-4 sm:flex-col">
          <Button
            type="button"
            variant="secondary"
            className="h-11 w-full rounded-xl"
            onClick={onPrint}
          >
            <Printer className="mr-2 size-4" />
            Print receipt
          </Button>
          <Button
            type="button"
            className="h-11 w-full rounded-xl"
            onClick={onConfirm}
          >
            Receipt OK — enable complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
