"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import {
  createCustomerApi,
  deleteCustomerApi,
  fetchCustomerCreditSummary,
  fetchCustomers,
  invalidateCustomerQueries,
  updateCustomerApi,
} from "@/lib/api/customers-fetch";
import type { CustomerListRow } from "@/lib/actions/customers";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { customerBalanceView } from "@/lib/utils/customer-balance";
import { useAuthStore } from "@/stores/authStore";

type FormValues = {
  name: string;
  phone: string;
  creditLimit: number;
  creditDays: number;
  openingCredit: number;
  openingDeposit: number;
};

type EditFormValues = {
  name: string;
  phone: string;
  creditLimit: number;
  creditDays: number;
};

type CustomerView = "all" | "credit";

export function CustomersPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: CustomerView =
    searchParams.get("view") === "credit" ? "credit" : "all";

  const setView = (next: CustomerView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "credit") params.set("view", "credit");
    else params.delete("view");
    const qs = params.toString();
    router.replace(qs ? `/customers?${qs}` : "/customers", { scroll: false });
  };

  const role = useAuthStore((s) => s.session?.role ?? null);
  const canManage = canManageSettings(isUserRole(role ?? "") ? role : null);

  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerListRow | null>(null);
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

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    reset: resetEdit,
  } = useForm<EditFormValues>();

  const { data: customers = [], isLoading, isError, error } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
    staleTime: 90_000,
    refetchOnMount: false,
  });

  const { data: creditSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["customer-credit-summary"],
    queryFn: fetchCustomerCreditSummary,
    staleTime: 90_000,
    refetchOnMount: false,
  });

  const displayedCustomers = useMemo(() => {
    if (view === "credit") {
      return customers.filter((c) => c.outstanding_balance > 0);
    }
    return customers;
  }, [customers, view]);

  const customersWithBalance = useMemo(
    () => customers.filter((c) => c.outstanding_balance > 0).length,
    [customers]
  );

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

  const updateMut = useMutation({
    mutationFn: (values: EditFormValues) => {
      if (!editTarget) throw new Error("No customer selected");
      return updateCustomerApi(editTarget.id, {
        name: values.name.trim(),
        phone: values.phone || undefined,
        creditLimit: Number(values.creditLimit) || 0,
        creditDays: Number(values.creditDays) || 0,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Customer updated");
        setEditTarget(null);
        invalidateCustomerQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Update failed");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCustomerApi(id),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Customer deleted");
        setDeleteTarget(null);
        invalidateCustomerQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    },
  });

  const openEdit = (c: CustomerListRow) => {
    setEditTarget(c);
    resetEdit({
      name: c.name,
      phone: c.phone ?? "",
      creditLimit: c.credit_limit,
      creditDays: c.credit_days,
    });
  };

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="dash-stat-card border-warning/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Total credit outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold text-warning">
              {summaryLoading
                ? "…"
                : formatTzs(creditSummary?.totalOutstanding ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {customersWithBalance} account(s) with balance
            </p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Credit issued this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold">
              {summaryLoading
                ? "…"
                : formatTzs(creditSummary?.creditIssuedMonth ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {creditSummary?.monthLabel ?? "This month"}
            </p>
          </CardContent>
        </Card>
        <Card className="dash-stat-card border-inflow/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              Credit paid this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-xl font-bold text-inflow">
              {summaryLoading
                ? "…"
                : formatTzs(creditSummary?.creditPaidMonth ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Customer payments received
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Customers</CardTitle>
            <div className="flex rounded-lg border border-border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={view === "all" ? "secondary" : "ghost"}
                className="h-7 rounded-md px-2.5 text-xs"
                onClick={() => setView("all")}
              >
                All ({customers.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "credit" ? "secondary" : "ghost"}
                className="h-7 rounded-md px-2.5 text-xs"
                onClick={() => setView("credit")}
              >
                With balance ({customersWithBalance})
              </Button>
            </div>
          </div>
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
          ) : displayedCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {view === "credit"
                ? "No outstanding customer balances."
                : "No customers yet. Add your first customer to start tracking credit and deposits."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  {view === "all" ? <TableHead>Type</TableHead> : null}
                  <TableHead className="text-right">Credit limit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedCustomers.map((c) => {
                  const balance = customerBalanceView(
                    c.outstanding_balance,
                    c.deposit_balance
                  );
                  return (
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
                    {view === "all" ? (
                      <TableCell className="capitalize">{c.customer_type}</TableCell>
                    ) : null}
                    <TableCell className="text-right">
                      {formatTzs(c.credit_limit)}
                    </TableCell>
                    <TableCell className="text-right font-money">
                      {balance.netDue > 0 ? (
                        <span className="text-warning" title="Amount due">
                          Due {formatTzs(balance.netDue)}
                        </span>
                      ) : balance.depositHeld > 0 ? (
                        <span className="text-inflow" title="Deposit on account">
                          Dep {formatTzs(balance.depositHeld)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/customers/${c.id}`}
                          className={cn(
                            buttonVariants({ size: "sm", variant: "outline" })
                          )}
                          title="View"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                        {canManage && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              title="Edit"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="Delete"
                              onClick={() => setDeleteTarget(c)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
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
                          title="Statement"
                        >
                          <FileText className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
                })}
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

      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleEditSubmit((v) => {
              if (!v.name?.trim()) {
                toast.error("Customer name is required");
                return;
              }
              updateMut.mutate(v);
            })}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...registerEdit("name", { required: true })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input {...registerEdit("phone")} placeholder="07xxxxxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Credit limit (TZS)</Label>
                <Input
                  type="number"
                  min={0}
                  className="font-money"
                  {...registerEdit("creditLimit")}
                />
              </div>
              <div className="space-y-2">
                <Label>Credit days</Label>
                <Input
                  type="number"
                  min={0}
                  {...registerEdit("creditDays")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <strong className="text-foreground">{deleteTarget?.name}</strong>?
            Only accounts with no credit balance, deposits, sales, or payment
            history can be deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending || !deleteTarget}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete customer"}
            </Button>
          </DialogFooter>
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
