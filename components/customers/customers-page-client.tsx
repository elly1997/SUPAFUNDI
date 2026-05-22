"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Plus, UserPlus, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
  createCustomerApi,
  fetchCustomers,
  invalidateCustomerQueries,
} from "@/lib/api/customers-fetch";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

type FormValues = {
  name: string;
  phone: string;
  creditLimit: number;
  creditDays: number;
  openingCredit: number;
  openingDeposit: number;
};

export function CustomersPageClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [payCustomer, setPayCustomer] = useState<{
    id: string;
    name: string;
    balance: number;
  } | null>(null);
  const [stmtCustomer, setStmtCustomer] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      creditLimit: 0,
      creditDays: 30,
      openingCredit: 0,
      openingDeposit: 0,
    },
  });

  const { data: customers = [], isLoading, isError, error } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: (values: FormValues) =>
      createCustomerApi({
        name: values.name.trim(),
        phone: values.phone || undefined,
        creditLimit: values.creditLimit,
        creditDays: values.creditDays,
        openingCredit: values.openingCredit,
        openingDeposit: values.openingDeposit,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Customer created");
        setOpen(false);
        reset();
        invalidateCustomerQueries(queryClient);
        router.push(`/customers/${r.id}`);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not create customer");
    },
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Customers</CardTitle>
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </Button>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Could not load customers:{" "}
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No customers yet. Add your first customer to start tracking credit
              and deposits.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Credit limit</TableHead>
                  <TableHead className="text-right">Credit due</TableHead>
                  <TableHead className="text-right">Deposit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell className="capitalize">{c.customer_type}</TableCell>
                    <TableCell className="text-right">
                      {formatTzs(c.credit_limit)}
                    </TableCell>
                    <TableCell className="text-right font-money">
                      {c.outstanding_balance > 0 ? (
                        <span className="text-warning">
                          {formatTzs(c.outstanding_balance)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-money text-inflow">
                      {c.deposit_balance > 0
                        ? formatTzs(c.deposit_balance)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/customers/${c.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" })
                          )}
                        >
                          <ExternalLink className="mr-1 size-3.5" />
                          View
                        </Link>
                        {c.outstanding_balance > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() =>
                              setPayCustomer({
                                id: c.id,
                                name: c.name,
                                balance: c.outstanding_balance,
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
                            setStmtCustomer({ id: c.id, name: c.name })
                          }
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
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              New customer
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((v) => {
              if (!v.name?.trim()) {
                toast.error("Customer name is required");
                return;
              }
              createMut.mutate(v);
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...register("name", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input {...register("phone")} placeholder="07xxxxxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Credit limit (TZS)</Label>
                <Input type="number" min={0} {...register("creditLimit")} />
              </div>
              <div className="space-y-2">
                <Label>Credit days</Label>
                <Input type="number" min={0} {...register("creditDays")} />
              </div>
              <div className="space-y-2">
                <Label>Opening credit (AR)</Label>
                <Input
                  type="number"
                  min={0}
                  className="font-money"
                  {...register("openingCredit")}
                />
              </div>
              <div className="space-y-2">
                <Label>Opening deposit</Label>
                <Input
                  type="number"
                  min={0}
                  className="font-money"
                  {...register("openingDeposit")}
                />
              </div>
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

      {payCustomer && (
        <RecordPartyPaymentDialog
          open={!!payCustomer}
          onOpenChange={(o) => !o && setPayCustomer(null)}
          partyType="customer"
          partyId={payCustomer.id}
          partyName={payCustomer.name}
          maxAmount={payCustomer.balance}
          onSuccess={() => invalidateCustomerQueries(queryClient)}
        />
      )}
      {stmtCustomer && (
        <PartyStatementDialog
          open={!!stmtCustomer}
          onOpenChange={(o) => !o && setStmtCustomer(null)}
          partyType="customer"
          partyId={stmtCustomer.id}
          partyName={stmtCustomer.name}
        />
      )}
    </>
  );
}
