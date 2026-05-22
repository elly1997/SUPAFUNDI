"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Plus, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  createSupplierApi,
  fetchSuppliers,
  invalidateSupplierQueries,
} from "@/lib/api/suppliers-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

export function SuppliersPageClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [paySupplier, setPaySupplier] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [stmtSupplier, setStmtSupplier] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading, isError, error } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createSupplierApi({
        name: name.trim(),
        phone: phone || undefined,
        openingBalance: Number(openingBalance) || 0,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Supplier added");
        setOpen(false);
        setName("");
        setPhone("");
        setOpeningBalance("");
        invalidateSupplierQueries(queryClient);
        router.push(`/suppliers/${r.id}`);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not create supplier");
    },
  });

  const totalPayables = suppliers.reduce(
    (s, x) => s + x.payables_balance,
    0
  );

  return (
    <>
      <Card className="mb-6 dash-stat-card border-warning/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">
            Total payables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-money text-2xl font-bold text-warning">
            {formatTzs(totalPayables)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Truck className="size-5" />
            Suppliers
          </CardTitle>
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add supplier
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load suppliers:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : suppliers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No suppliers yet. Add a supplier to track payables and payments.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Payables</TableHead>
                  <TableHead className="text-right">Credit limit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link
                        href={`/suppliers/${s.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell>{s.phone ?? "—"}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-money",
                        s.payables_balance > 0 && "font-semibold text-warning"
                      )}
                    >
                      {formatTzs(s.payables_balance)}
                    </TableCell>
                    <TableCell className="text-right font-money">
                      {formatTzs(s.credit_limit)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/suppliers/${s.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" })
                          )}
                        >
                          <ExternalLink className="mr-1 size-3.5" />
                          View
                        </Link>
                        {s.payables_balance > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              setPaySupplier({
                                id: s.id,
                                name: s.name,
                                balance: s.payables_balance,
                              })
                            }
                          >
                            <Wallet className="mr-1 size-3.5" />
                            Pay
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setStmtSupplier({ id: s.id, name: s.name })
                          }
                          title="Statement"
                        >
                          <FileText className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New supplier</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) {
                toast.error("Supplier name is required");
                return;
              }
              createMut.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Opening payables balance (TZS)</Label>
              <Input
                type="number"
                min={0}
                className="font-money"
                placeholder="0"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
              <p className="form-hint">
                Creates an open supplier bill in accounts payable.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Save & open"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {paySupplier && (
        <RecordPartyPaymentDialog
          open={!!paySupplier}
          onOpenChange={(o) => !o && setPaySupplier(null)}
          partyType="supplier"
          partyId={paySupplier.id}
          partyName={paySupplier.name}
          maxAmount={paySupplier.balance}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            queryClient.invalidateQueries({ queryKey: ["payables-open"] });
          }}
        />
      )}
      {stmtSupplier && (
        <PartyStatementDialog
          open={!!stmtSupplier}
          onOpenChange={(o) => !o && setStmtSupplier(null)}
          partyType="supplier"
          partyId={stmtSupplier.id}
          partyName={stmtSupplier.name}
        />
      )}
    </>
  );
}
