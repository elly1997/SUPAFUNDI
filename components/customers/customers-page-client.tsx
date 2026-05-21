"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import { createCustomer, listCustomers } from "@/lib/actions/customers";
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
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      creditLimit: 0,
      creditDays: 30,
      openingCredit: 0,
      openingDeposit: 0,
    },
  });

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: listCustomers,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const createMut = useMutation({
    mutationFn: createCustomer,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Customer created");
        setOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: ["customers"] });
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Customers</CardTitle>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add customer
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              New customer
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((v) =>
              createMut.mutate({
                name: v.name,
                phone: v.phone,
                creditLimit: Number(v.creditLimit),
                creditDays: Number(v.creditDays),
                openingCredit: Number(v.openingCredit) || 0,
                openingDeposit: Number(v.openingDeposit) || 0,
                customerType: "retail",
                priceType: "retail",
              })
            )}
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
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
