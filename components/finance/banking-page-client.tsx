"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2, Plus } from "lucide-react";
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
  createBankAccount,
  listBankAccounts,
  listBankTransactions,
  recordBankTransaction,
  toggleBankTransactionReconciled,
} from "@/lib/actions/banking";
import { formatTzs } from "@/lib/utils/currency";

export function BankingPageClient() {
  const queryClient = useQueryClient();
  const [accountOpen, setAccountOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [acctName, setAcctName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [openingBal, setOpeningBal] = useState("");
  const [txnType, setTxnType] = useState<"deposit" | "withdrawal">("deposit");
  const [txnAmount, setTxnAmount] = useState("");
  const [txnDesc, setTxnDesc] = useState("");

  const { data: accounts = [], isLoading: acctLoading } = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: listBankAccounts,
  });

  const filterId = selectedAccount === "all" ? null : selectedAccount;
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ["bank-transactions", filterId],
    queryFn: () => listBankTransactions(filterId),
  });

  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0);

  const createAcctMut = useMutation({
    mutationFn: () =>
      createBankAccount({
        name: acctName,
        bankName: bankName || undefined,
        accountNo: accountNo || undefined,
        openingBalance: Number(openingBal) || 0,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Bank account added");
        setAccountOpen(false);
        setAcctName("");
        setBankName("");
        setAccountNo("");
        setOpeningBal("");
        void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
        void queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      } else toast.error(r.message);
    },
  });

  const txnMut = useMutation({
    mutationFn: () =>
      recordBankTransaction({
        bankAccountId: selectedAccount === "all" ? accounts[0]?.id ?? "" : selectedAccount,
        transactionType: txnType,
        amount: Number(txnAmount),
        description: txnDesc || undefined,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Transaction recorded");
        setTxnOpen(false);
        setTxnAmount("");
        setTxnDesc("");
        void queryClient.invalidateQueries({ queryKey: ["bank-accounts"] });
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass-card sm:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="size-5 text-primary" />
              Total bank balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-money text-2xl font-bold">{formatTzs(totalBalance)}</p>
            <p className="text-xs text-muted-foreground">
              {accounts.length} active account(s)
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
            disabled={accounts.length === 0}
            onClick={() => setTxnOpen(true)}
          >
            Record transaction
          </Button>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {acctLoading ? (
            <Loader2 className="mx-auto size-8 animate-spin" />
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add a bank or M-Pesa business account to track deposits and reconcile
              against supplier payments.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAccount(a.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selectedAccount === a.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-surface-1/40 hover:border-primary/40"
                  }`}
                >
                  <p className="font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.bank_name ?? "—"}
                    {a.account_no ? ` · ${a.account_no}` : ""}
                  </p>
                  <p className="mt-2 font-money text-lg font-semibold">
                    {formatTzs(a.current_balance)}
                  </p>
                </button>
              ))}
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
            <SelectTrigger className="w-48">
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
          {txLoading ? (
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bank account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Account name</Label>
              <Input value={acctName} onChange={(e) => setAcctName(e.target.value)} />
            </div>
            <div>
              <Label>Bank / provider</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div>
              <Label>Account number</Label>
              <Input value={accountNo} onChange={(e) => setAccountNo(e.target.value)} />
            </div>
            <div>
              <Label>Opening balance (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={openingBal}
                onChange={(e) => setOpeningBal(e.target.value)}
              />
            </div>
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
                selectedAccount === "all" && accounts.length === 0
                  ? true
                  : !txnAmount || Number(txnAmount) <= 0 || txnMut.isPending
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
