"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PartyStatementDialog } from "@/components/finance/party-statement-dialog";
import { RecordPartyPaymentDialog } from "@/components/finance/record-party-payment-dialog";
import { listCustomersWithBalance } from "@/lib/actions/credit";
import { formatTzs } from "@/lib/utils/currency";

export function CreditPageClient() {
  const [payCustomerId, setPayCustomerId] = useState<string | null>(null);
  const [stmtCustomerId, setStmtCustomerId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: balances = [], isLoading } = useQuery({
    queryKey: ["credit-balances"],
    queryFn: listCustomersWithBalance,
  });

  const payCustomer = balances.find((c) => c.id === payCustomerId);
  const stmtCustomer = balances.find((c) => c.id === stmtCustomerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts receivable</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : balances.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No outstanding customer balances.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Credit limit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-right font-money text-warning">
                    {formatTzs(c.outstanding_balance)}
                  </TableCell>
                  <TableCell className="text-right font-money">
                    {formatTzs(c.credit_limit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStmtCustomerId(c.id)}
                      >
                        <FileText className="size-4" />
                      </Button>
                      <Button size="sm" onClick={() => setPayCustomerId(c.id)}>
                        <Wallet className="mr-1 size-4" />
                        Pay
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {payCustomer && (
        <RecordPartyPaymentDialog
          open={!!payCustomerId}
          onOpenChange={(o) => !o && setPayCustomerId(null)}
          partyType="customer"
          partyId={payCustomer.id}
          partyName={payCustomer.name}
          maxAmount={payCustomer.outstanding_balance}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["credit-balances"] });
            queryClient.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
      {stmtCustomer && (
        <PartyStatementDialog
          open={!!stmtCustomerId}
          onOpenChange={(o) => !o && setStmtCustomerId(null)}
          partyType="customer"
          partyId={stmtCustomer.id}
          partyName={stmtCustomer.name}
        />
      )}
    </Card>
  );
}
