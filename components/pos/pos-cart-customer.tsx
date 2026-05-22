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
import {
  createCustomerApi,
  fetchPosCustomers,
  invalidateCustomerQueries,
  type PosCustomer,
} from "@/lib/api/customers-fetch";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  customerId: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerSelect?: (customer: PosCustomer | null) => void;
};

export function PosCartCustomer({
  customerId,
  onCustomerIdChange,
  onCustomerSelect,
}: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: fetchPosCustomers,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createCustomerApi({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        customerType: "retail",
        creditLimit: 0,
        creditDays: 30,
        priceType: "retail",
        openingCredit: 0,
        openingDeposit: 0,
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
      invalidateCustomerQueries(queryClient);
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
  const displayLabel = selected?.name ?? "Walk-in";

  return (
    <>
      <div className="flex items-center gap-2">
        <Select
          value={customerId || "__walkin__"}
          onValueChange={(v) => {
            const id = !v || v === "__walkin__" ? "" : v;
            onCustomerIdChange(id);
            const c = customers.find((x) => x.id === id) ?? null;
            onCustomerSelect?.(c);
          }}
        >
          <SelectTrigger
            className="h-9 min-w-0 flex-1 rounded-lg border-border bg-surface-1 text-sm text-foreground"
            aria-label="Customer"
          >
            <SelectValue>{displayLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__walkin__">Walk-in</SelectItem>
            {isLoading ? (
              <SelectItem value="__loading" disabled>
                Loading…
              </SelectItem>
            ) : (
              customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  {c.outstanding_balance > 0
                    ? ` · ${formatTzs(c.outstanding_balance)}`
                    : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 shrink-0 rounded-lg"
          title="Add customer"
          onClick={() => setAddOpen(true)}
        >
          <UserPlus className="size-4" />
        </Button>
      </div>

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
    </>
  );
}
