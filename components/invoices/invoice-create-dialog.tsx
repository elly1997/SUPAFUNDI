"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import type { SaleDocumentType } from "@/lib/constants/sale-documents";
import { createDraftSaleDocument } from "@/lib/actions/invoices";
import { fetchPosCustomers } from "@/lib/api/customers-fetch";
import { useQuery } from "@tanstack/react-query";
import { useTaxRate } from "@/hooks/useTaxRate";
import { useAuthStore } from "@/stores/authStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType: SaleDocumentType;
  onCreated: () => void;
};

export function InvoiceCreateDialog({
  open,
  onOpenChange,
  defaultType,
  onCreated,
}: Props) {
  const taxRate = useTaxRate();
  const outletId = useAuthStore((s) => s.activeOutletId);
  const [customerId, setCustomerId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers"],
    queryFn: fetchPosCustomers,
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: createDraftSaleDocument,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Created ${r.invoiceNo}`);
        onOpenChange(false);
        onCreated();
        setDescription("");
        setAmount("");
      } else toast.error(r.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!outletId) {
              toast.error("Select an outlet first");
              return;
            }
            const amt = Number(amount);
            if (!description.trim() || !amt || amt <= 0) {
              toast.error("Description and amount required");
              return;
            }
            createMut.mutate({
              outletId,
              customerId: customerId || null,
              saleType: defaultType,
              taxRate,
              cartDiscountAmount: 0,
              lines: [
                {
                  productName: description.trim(),
                  quantity: 1,
                  unitPrice: amt,
                  discountPct: 0,
                },
              ],
              validUntil: validUntil || undefined,
            });
          }}
        >
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select
              value={customerId || "__none__"}
              onValueChange={(v) =>
                setCustomerId(!v || v === "__none__" ? "" : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Walk-in" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Walk-in</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Line description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 50 bags cement Dangote"
            />
          </div>
          <div className="space-y-2">
            <Label>Amount (TZS)</Label>
            <Input
              type="number"
              min={0}
              className="font-money"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Valid until (optional)</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save draft"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
