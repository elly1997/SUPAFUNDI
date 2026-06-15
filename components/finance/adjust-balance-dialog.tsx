"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
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
import type { PaymentAccountRow } from "@/lib/actions/banking";
import { adjustAccountBalanceApi } from "@/lib/api/banking-fetch";
import { paymentAccountTypeLabel } from "@/lib/constants/payment-accounts";
import { formatTzs } from "@/lib/utils/currency";

type Props = {
  account: PaymentAccountRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function AdjustBalanceDialog({
  account,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [newBalance, setNewBalance] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open && account) {
      setNewBalance(String(account.current_balance));
      setReason("");
      setPassword("");
    }
  }, [open, account]);

  const adjustMut = useMutation({
    mutationFn: () => {
      if (!account) throw new Error("No account selected");
      return adjustAccountBalanceApi({
        bankAccountId: account.id,
        newBalance: Number(newBalance),
        reason: reason.trim(),
        adminPassword: password,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Balance updated");
        onOpenChange(false);
        onSuccess();
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Adjustment failed"),
  });

  if (!account) return null;

  const parsed = Number(newBalance);
  const delta =
    Number.isFinite(parsed) && account
      ? parsed - account.current_balance
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            Adjust balance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-surface-1/40 px-3 py-2 text-sm">
            <p className="font-medium">{account.name}</p>
            <p className="text-xs text-muted-foreground">
              {paymentAccountTypeLabel(account.account_type)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Current:{" "}
              <span className="font-money font-semibold text-foreground">
                {formatTzs(account.current_balance)}
              </span>
            </p>
          </div>

          <div>
            <Label htmlFor="adj-balance">New balance (TZS)</Label>
            <Input
              id="adj-balance"
              type="number"
              min={0}
              step="any"
              className="font-money"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
            />
            {Number.isFinite(parsed) && delta !== 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Change:{" "}
                <span
                  className={
                    delta > 0 ? "text-inflow font-money" : "text-outflow font-money"
                  }
                >
                  {delta > 0 ? "+" : ""}
                  {formatTzs(delta)}
                </span>
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="adj-reason">Reason (required)</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bank statement reconcile, M-Pesa float correction"
            />
          </div>

          <div>
            <Label htmlFor="adj-password">Your password (owner/manager)</Label>
            <Input
              id="adj-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirm with your login password"
            />
            <p className="form-hint mt-1">
              Only owners and managers can adjust balances. Your login password
              is required for audit protection.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              adjustMut.isPending ||
              !reason.trim() ||
              reason.trim().length < 3 ||
              password.length < 6 ||
              !Number.isFinite(parsed) ||
              parsed < 0
            }
            onClick={() => adjustMut.mutate()}
          >
            {adjustMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Update balance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
