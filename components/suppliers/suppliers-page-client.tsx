"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
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
import { canManageSettings, isUserRole } from "@/lib/auth/roles";
import {
  createSupplierApi,
  deleteSupplierApi,
  fetchSuppliers,
  invalidateSupplierQueries,
  updateSupplierApi,
} from "@/lib/api/suppliers-fetch";
import type { SupplierListRow } from "@/lib/actions/suppliers";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";
import { useAuthStore } from "@/stores/authStore";

export function SuppliersPageClient() {
  const router = useRouter();
  const role = useAuthStore((s) => s.session?.role ?? null);
  const canManage = canManageSettings(isUserRole(role ?? "") ? role : null);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [editTarget, setEditTarget] = useState<SupplierListRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContact, setEditContact] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SupplierListRow | null>(null);
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

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editTarget) throw new Error("No supplier selected");
      return updateSupplierApi(editTarget.id, {
        name: editName.trim(),
        phone: editPhone || undefined,
        contactPerson: editContact || undefined,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Supplier updated");
        setEditTarget(null);
        invalidateSupplierQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Update failed");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSupplierApi(id),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Supplier deleted");
        setDeleteTarget(null);
        invalidateSupplierQueries(queryClient);
      } else toast.error(r.message);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    },
  });

  const openEdit = (s: SupplierListRow) => {
    setEditTarget(s);
    setEditName(s.name);
    setEditPhone(s.phone ?? "");
    setEditContact(s.contact_person ?? "");
  };

  const totalPayables = suppliers.reduce(
    (s, x) => s + (Number(x.payables_balance) || 0),
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
                {suppliers.map((s) => {
                  const payables = Number(s.payables_balance) || 0;
                  const creditLimit = Number(s.credit_limit) || 0;
                  return (
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
                          payables > 0 && "font-semibold text-warning"
                        )}
                      >
                        {formatTzs(payables)}
                      </TableCell>
                      <TableCell className="text-right font-money">
                        {formatTzs(creditLimit)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`/suppliers/${s.id}`}
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
                                onClick={() => openEdit(s)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title="Delete"
                                onClick={() => setDeleteTarget(s)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                          {payables > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                setPaySupplier({
                                  id: s.id,
                                  name: s.name,
                                  balance: payables,
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

      <Dialog
        open={!!editTarget}
        onOpenChange={(v) => {
          if (!v) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit supplier</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editName.trim()) {
                toast.error("Supplier name is required");
                return;
              }
              updateMut.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact person</Label>
              <Input
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
              />
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
            <DialogTitle>Delete supplier?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove{" "}
            <strong className="text-foreground">{deleteTarget?.name}</strong>?
            Only empty accounts with no payables, purchase orders, receipts on
            account, or payments can be deleted. Linked products will keep their
            records but lose this supplier link.
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
              {deleteMut.isPending ? "Deleting…" : "Delete supplier"}
            </Button>
          </DialogFooter>
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
            invalidateSupplierQueries(queryClient);
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
