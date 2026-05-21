"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { createSupplierRecord, listSuppliers } from "@/lib/actions/suppliers";
import { cn } from "@/lib/utils";
import { formatTzs } from "@/lib/utils/currency";

export function SuppliersPageClient() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const queryClient = useQueryClient();

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: listSuppliers,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createSupplierRecord({
        name,
        phone: phone || undefined,
        creditLimit: 0,
        creditDays: 30,
        openingBalance: Number(openingBalance) || 0,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Supplier added");
        setOpen(false);
        setName("");
        setPhone("");
        setOpeningBalance("");
        queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      } else toast.error(r.message);
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
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add supplier
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Payables</TableHead>
                  <TableHead className="text-right">Credit limit</TableHead>
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
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
