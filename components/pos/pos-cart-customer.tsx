"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCustomer } from "@/lib/actions/customers";
import { listCustomersForPos, type PosCustomer } from "@/lib/actions/sales";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  walkInName: string;
  onWalkInNameChange: (name: string) => void;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
};

export function PosCartCustomer({
  customerId,
  onCustomerIdChange,
  walkInName,
  onWalkInNameChange,
  onCustomerSelect,
}: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: listCustomersForPos,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createCustomer({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        customerType: "retail",
        creditLimit: 0,
        creditDays: 30,
        priceType: "retail",
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Customer added");
      const name = newName.trim();
      const phone = newPhone.trim() || null;
      setAddOpen(false);
      setNewName("");
      setNewPhone("");
      void queryClient.invalidateQueries({ queryKey: ["pos-customers"] });
      onCustomerIdChange(res.id);
      onCustomerSelect?.({
        id: res.id,
        name,
        phone,
        outstanding_balance: 0,
        credit_limit: 0,
        price_type: "retail",
      });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not add customer");
    },
  });

  const selected = customers.find((c) => c.id === customerId) ?? null;
  const isWalkIn = !customerId;

  return (
    <div className="space-y-2 border-b border-border bg-header/40 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Customer
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-primary"
          onClick={() => setAddOpen(true)}
        >
          <UserPlus className="size-3.5" />
          Add new
        </Button>
      </div>
      <Select
        value={customerId || "__walkin__"}
        onValueChange={(v) => {
          const id = !v || v === "__walkin__" ? "" : v;
          onCustomerIdChange(id);
          const c = customers.find((x) => x.id === id) ?? null;
          onCustomerSelect?.(c);
        }}
      >
        <SelectTrigger className="h-11 rounded-xl border-border bg-surface-1 text-foreground">
          <SelectValue placeholder="Select customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__walkin__">Walk-in customer</SelectItem>
          {isLoading ? (
            <SelectItem value="__loading" disabled>
              Loading…
            </SelectItem>
          ) : (
            customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.outstanding_balance > 0
                  ? ` · owed ${formatTzs(c.outstanding_balance)}`
                  : ""}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {isWalkIn ? (
        <div className="space-y-1">
          <Label htmlFor="pos-walkin-name" className="text-xs text-muted-foreground">
            Walk-in name (optional, for receipt)
          </Label>
          <Input
            id="pos-walkin-name"
            className="h-10 rounded-xl bg-surface-1 text-foreground"
            placeholder="e.g. Walk-in, John Doe"
            value={walkInName}
            onChange={(e) => onWalkInNameChange(e.target.value)}
          />
        </div>
      ) : selected ? (
        <p className="text-xs text-muted-foreground">
          {selected.price_type === "wholesale" ? "Wholesale pricing" : "Retail pricing"}
          {selected.credit_limit > 0
            ? ` · Credit limit ${formatTzs(selected.credit_limit)}`
            : ""}
        </p>
      ) : null}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-cust-name">Name</Label>
              <Input
                id="new-cust-name"
                className="bg-surface-1 text-foreground"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-cust-phone">Phone (optional)</Label>
              <Input
                id="new-cust-phone"
                className="bg-surface-1 text-foreground"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!newName.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
