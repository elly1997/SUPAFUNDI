"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, Plus, Smartphone, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PAYMENT_ACCOUNT_TYPES,
  formatAccountDetails,
  paymentAccountTypeLabel,
  type PaymentAccountType,
} from "@/lib/constants/payment-accounts";
import {
  fetchBankTransactions,
  fetchPaymentAccounts,
} from "@/lib/api/banking-fetch";
import {
  createPaymentAccount,
  recordBankTransaction,
  toggleBankTransactionReconciled,
} from "@/lib/actions/banking";
import { formatTzs } from "@/lib/utils/currency";

function accountTypeIcon(type: PaymentAccountType) {
  if (type === "bank") return Landmark;
  return Smartphone;
}

export function BankingPageClient() {
  const queryClient = useQueryClient();
  const [accountOpen, setAccountOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [acctName, setAcctName] = useState("");
  const [accountType, setAccountType] = useState<PaymentAccountType>("bank");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [lipaMerchant, setLipaMerchant] = useState("");
  const [showInPos, setShowInPos] = useState(true);
  const [openingBal, setOpeningBal] = useState("");
  const [txnType, setTxnType] = useState<"deposit" | "withdrawal">("deposit");
  const [txnAmount, setTxnAmount] = useState("");
  const [txnDesc, setTxnDesc] = useState("");

  const {
    data: accounts = [],
    isLoading: acctLoading,
    isError: acctError,
    error: acctErr,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["payment-accounts"],
    queryFn: fetchPaymentAccounts,
  });

  const activeAccounts = accounts.filter((a) => a.is_active);
  const filterId = selectedAccount === "all" ? null : selectedAccount;
  const {
    data: transactions = [],
    isLoading: txLoading,
    isError: txError,
    error: txErr,
  } = useQuery({
    queryKey: ["bank-transactions", filterId],
    queryFn: () => fetchBankTransactions(filterId),
    enabled: !acctError,
  });

  const selected =
    selectedAccount !== "all"
      ? accounts.find((a) => a.id === selectedAccount)
      : null;

  const totalBalance = activeAccounts.reduce((s, a) => s + a.current_balance, 0);

  useEffect(() => {
    if (
      selectedAccount !== "all" &&
      accounts.length > 0 &&
      !accounts.some((a) => a.id === selectedAccount)
    ) {
      setSelectedAccount("all");
    }
  }, [accounts, selectedAccount]);

  const createAcctMut = useMutation({
    mutationFn: () =>
      createPaymentAccount({
        name: acctName,
        accountType,
        bankName: bankName || undefined,
        accountNo: accountNo || undefined,
        lipaMerchant: lipaMerchant || undefined,
        showInPos,
        openingBalance: Number(openingBal) || 0,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Collection account added");
        setAccountOpen(false);
        setAcctName("");
        setBankName("");
        setAccountNo("");
        setLipaMerchant("");
        setOpeningBal("");
        setAccountType("bank");
        void queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
        void queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
        void queryClient.invalidateQueries({ queryKey: ["pos-payment-accounts"] });
      } else toast.error(r.message);
    },
  });

  const txnMut = useMutation({
    mutationFn: () => {
      const accountId =
        selectedAccount === "all" ? activeAccounts[0]?.id ?? "" : selectedAccount;
      return recordBankTransaction({
        bankAccountId: accountId,
        transactionType: txnType,
        amount: Number(txnAmount),
        description: txnDesc || undefined,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transaction recorded");
        setTxnOpen(false);
        setTxnAmount("");
        setTxnDesc("");
        void queryClient.invalidateQueries({ queryKey: ["payment-accounts"] });
        void queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      } else toast.error(r.message);
    },
  });

  const reconcileMut = useMutation({
    mutationFn: ({ id, reconciled }: { id: string; reconciled: boolean }) =>
      toggleBankTransactionReconciled(id, reconciled),
    onSuccess: (r) => {
      if (r.ok) {
        void queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      } else toast.error(r.message);
    },
  });

  const typeHint = PAYMENT_ACCOUNT_TYPES.find((t) => t.value === accountType)?.hint;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass-card sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-5 text-primary" />
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-2xl font-bold">{formatTzs(totalBalance)}</p>
            <p className="text-xs text-muted-foreground">
              {activeAccounts.length} active account(s) · bank, M-Pesa, Lipa
            </p>
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <Button type="button" onClick={() => setAccountOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add account
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={activeAccounts.length === 0}
            onClick={() => setTxnOpen(true)}
          >
            Record transaction
          </Button>
        </div>
      </div>

      {acctError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Could not load accounts.</strong>{" "}
          {acctErr instanceof Error ? acctErr.message : "Unknown error"}
          <Button
            type="button"
            variant="link"
            className="ml-2 h-auto p-0 text-destructive"
            onClick={() => void refetchAccounts()}
          >
            Retry
          </Button>
        </div>
      )}

      {selected && (
        <Card className="glass-card border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected.name}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium">
                {paymentAccountTypeLabel(selected.account_type)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Details</span>
              <p className="font-medium">{formatAccountDetails(selected)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Balance</span>
              <p className="font-money text-lg font-semibold">
                {formatTzs(selected.current_balance)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">POS</span>
              <p className="font-medium">
                {selected.show_in_pos
                  ? `Shown for ${selected.pos_payment_method ?? "—"} payments`
                  : "Hidden on POS"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Collection accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {acctLoading ? (
            <Loader2 className="mx-auto size-8 animate-spin" />
          ) : accounts.length === 0 && !acctError ? (
            <p className="text-sm text-muted-foreground">
              Add bank accounts, M-Pesa wallets, Lipa numbers, or tills. Enable
              &quot;Show on POS&quot; so cashiers route M-Pesa and bank payments to the
              right account.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => {
                const Icon = accountTypeIcon(a.account_type);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAccount(a.id)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      selectedAccount === a.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface-1/40 hover:border-primary/40"
                    } ${!a.is_active ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {paymentAccountTypeLabel(a.account_type)}
                          {!a.is_active ? " · inactive" : ""}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {formatAccountDetails(a)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 font-money text-lg font-semibold">
                      {formatTzs(a.current_balance)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Transactions</CardTitle>
          <Select
            value={selectedAccount}
            onValueChange={(v) => setSelectedAccount(v ?? "all")}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {txError ? (
            <p className="text-sm text-destructive">
              {txErr instanceof Error ? txErr.message : "Could not load transactions"}
            </p>
          ) : txLoading ? (
            <Loader2 className="mx-auto size-8 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reconciled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">
                        {t.transaction_date ?? t.created_at.slice(0, 10)}
                      </TableCell>
                      <TableCell>{t.account_name}</TableCell>
                      <TableCell className="capitalize">{t.transaction_type}</TableCell>
                      <TableCell className="text-right font-money">
                        {formatTzs(t.amount)}
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={t.is_reconciled}
                          onChange={(e) =>
                            reconcileMut.mutate({
                              id: t.id,
                              reconciled: e.target.checked,
                            })
                          }
                          className="size-4"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add collection account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Account type</Label>
              <Select
                value={accountType}
                onValueChange={(v) =>
                  setAccountType((v ?? "bank") as PaymentAccountType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {typeHint && (
                <p className="form-hint mt-1">{typeHint}</p>
              )}
            </div>
            <div>
              <Label>Display name</Label>
              <Input
                value={acctName}
                onChange={(e) => setAcctName(e.target.value)}
                placeholder="e.g. CRDB Main, Vodacom Lipa"
              />
            </div>
            {accountType === "bank" && (
              <div>
                <Label>Bank name</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>
            )}
            {accountType === "lipa" && (
              <div>
                <Label>Merchant / provider</Label>
                <Input
                  value={lipaMerchant}
                  onChange={(e) => setLipaMerchant(e.target.value)}
                  placeholder="e.g. Vodacom Lipa"
                />
              </div>
            )}
            <div>
              <Label>
                {accountType === "bank"
                  ? "Account number"
                  : accountType === "lipa"
                    ? "Lipa number"
                    : "Number / till / paybill"}
              </Label>
              <Input
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value)}
              />
            </div>
            {(accountType === "mpesa" || accountType === "till") && (
              <div>
                <Label>Provider (optional)</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="M-Pesa, Airtel, etc."
                />
              </div>
            )}
            <div>
              <Label>Opening balance (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={openingBal}
                onChange={(e) => setOpeningBal(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showInPos}
                onChange={(e) => setShowInPos(e.target.checked)}
                className="size-4"
              />
              Show on POS for matching payments (M-Pesa / bank / card)
            </label>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => createAcctMut.mutate()}
              disabled={!acctName.trim() || createAcctMut.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedAccount === "all" && activeAccounts.length > 0 && (
              <p className="text-xs text-warning">
                Posting to: {activeAccounts[0]?.name}. Select an account card first
                to target another.
              </p>
            )}
            <div>
              <Label>Type</Label>
              <Select
                value={txnType}
                onValueChange={(v) =>
                  setTxnType((v ?? "deposit") as "deposit" | "withdrawal")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={txnAmount}
                onChange={(e) => setTxnAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => txnMut.mutate()}
              disabled={
                activeAccounts.length === 0 ||
                !txnAmount ||
                Number(txnAmount) <= 0 ||
                txnMut.isPending
              }
            >
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
