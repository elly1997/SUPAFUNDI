"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { CollectionAccountSelect } from "@/components/finance/collection-account-select";
import { needsCollectionAccount } from "@/lib/finance/collection-accounts";
import type { EmployeeRow } from "@/lib/actions/employees";
import type { PayrollRunDetail } from "@/lib/actions/payroll";
import {
  closePayrollRunApi,
  createEmployeeApi,
  fetchEmployees,
  fetchPayrollRun,
  importEmployeesFromProfilesApi,
  recordEmployeeBonusApi,
  refreshPayrollRunApi,
  updateEmployeeApi,
} from "@/lib/api/payroll-fetch";
import { formatTzs } from "@/lib/utils/currency";

function currentPayrollMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type PayLineDraft = {
  lineId: string;
  paymentMethod: "cash" | "mpesa" | "bank_transfer";
  bankAccountId: string;
  referenceNo: string;
};

export function PayrollPageClient() {
  const queryClient = useQueryClient();
  const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth());
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeRow | null>(null);
  const [bonusTarget, setBonusTarget] = useState<EmployeeRow | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [payDrafts, setPayDrafts] = useState<PayLineDraft[]>([]);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newGross, setNewGross] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [bonusDesc, setBonusDesc] = useState("");

  const { data: employees = [], isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const {
    data: payrollRun,
    isLoading: runLoading,
    refetch: refetchRun,
  } = useQuery({
    queryKey: ["payroll-run", payrollMonth],
    queryFn: () => fetchPayrollRun(payrollMonth),
  });

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.is_active),
    [employees]
  );

  const refreshMut = useMutation({
    mutationFn: () => refreshPayrollRunApi(payrollMonth),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payroll figures updated");
        void queryClient.invalidateQueries({ queryKey: ["payroll-run", payrollMonth] });
      } else toast.error(r.message);
    },
  });

  const importMut = useMutation({
    mutationFn: importEmployeesFromProfilesApi,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Imported ${r.imported} team member(s)`);
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
      } else toast.error(r.message);
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      createEmployeeApi({
        fullName: newName.trim(),
        phone: newPhone || undefined,
        jobTitle: newTitle || undefined,
        grossMonthlySalary: Number(newGross) || 0,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Employee added");
        setAddOpen(false);
        setNewName("");
        setNewPhone("");
        setNewTitle("");
        setNewGross("");
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
      } else toast.error(r.message);
    },
  });

  const updateMut = useMutation({
    mutationFn: (e: EmployeeRow) =>
      updateEmployeeApi(e.id, {
        fullName: e.full_name,
        phone: e.phone ?? undefined,
        jobTitle: e.job_title ?? undefined,
        grossMonthlySalary: e.gross_monthly_salary,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Saved");
        setEditTarget(null);
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
        void refreshMut.mutate();
      } else toast.error(r.message);
    },
  });

  const bonusMut = useMutation({
    mutationFn: () =>
      recordEmployeeBonusApi({
        employeeId: bonusTarget!.id,
        amount: Number(bonusAmount),
        bonusDate: `${payrollMonth}-15`,
        description: bonusDesc || undefined,
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Bonus recorded");
        setBonusTarget(null);
        setBonusAmount("");
        setBonusDesc("");
        void queryClient.invalidateQueries({ queryKey: ["payroll-run", payrollMonth] });
      } else toast.error(r.message);
    },
  });

  const closeMut = useMutation({
    mutationFn: () =>
      closePayrollRunApi({
        payrollMonth,
        lines: payDrafts.map((d) => ({
          lineId: d.lineId,
          paymentMethod: d.paymentMethod,
          bankAccountId: d.bankAccountId || undefined,
          referenceNo: d.referenceNo || undefined,
        })),
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Payroll closed — salaries posted and paid");
        setCloseOpen(false);
        void refetchRun();
        void queryClient.invalidateQueries({ queryKey: ["employees"] });
      } else toast.error(r.message);
    },
  });

  const openCloseDialog = (run: PayrollRunDetail) => {
    setPayDrafts(
      run.lines
        .filter((l) => l.gross_salary > 0 || l.net_salary > 0)
        .map((l) => ({
          lineId: l.id,
          paymentMethod: "cash" as const,
          bankAccountId: "",
          referenceNo: "",
        }))
    );
    setCloseOpen(true);
  };

  const isClosed = payrollRun?.status === "closed";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Staff &amp; payroll
          </h1>
          <p className="text-sm text-muted-foreground">
            Register employees, track salary advances (via Expenses → Salary
            advance), bonuses, and close monthly net pay through cash, M-Pesa, or
            bank.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="month"
            className="w-40"
            value={payrollMonth}
            onChange={(e) => setPayrollMonth(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={refreshMut.isPending || isClosed}
            onClick={() => refreshMut.mutate()}
          >
            {refreshMut.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 size-4" />
            )}
            Refresh month
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            Registered staff
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              Import from team
            </Button>
            <Button type="button" onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 size-4" />
              Add employee
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {empLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : activeEmployees.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No employees yet. Add staff or import from Settings → Users.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Gross / month</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeEmployees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="font-medium">{e.full_name}</p>
                      <p className="text-xs text-muted-foreground">{e.phone ?? "—"}</p>
                    </TableCell>
                    <TableCell>{e.job_title ?? "—"}</TableCell>
                    <TableCell className="text-right font-money">
                      {formatTzs(e.gross_monthly_salary)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditTarget({ ...e })}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-1"
                        onClick={() => setBonusTarget(e)}
                      >
                        Bonus
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>
              Payroll — {payrollMonth}
              {isClosed ? (
                <span className="ml-2 rounded bg-inflow/15 px-2 py-0.5 text-xs font-medium text-inflow">
                  Closed
                </span>
              ) : (
                <span className="ml-2 rounded bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                  Open
                </span>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Net = gross + bonuses − salary advances (from expenses this month)
            </p>
          </div>
          {payrollRun && !isClosed && payrollRun.lines.length > 0 ? (
            <Button type="button" onClick={() => openCloseDialog(payrollRun)}>
              Close &amp; pay salaries
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {runLoading && !payrollRun ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : !payrollRun || payrollRun.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Click <strong>Refresh month</strong> to calculate payroll from
              registered staff.
            </p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Gross total</p>
                  <p className="font-money text-lg font-semibold">
                    {formatTzs(payrollRun.totals.gross)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Advances</p>
                  <p className="font-money text-lg font-semibold text-warning">
                    − {formatTzs(payrollRun.totals.advances)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Bonuses</p>
                  <p className="font-money text-lg font-semibold text-inflow">
                    + {formatTzs(payrollRun.totals.bonuses)}
                  </p>
                </div>
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground">Net to pay</p>
                  <p className="font-money text-lg font-bold text-primary">
                    {formatTzs(payrollRun.totals.net)}
                  </p>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Advances</TableHead>
                    <TableHead className="text-right">Bonuses</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollRun.lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.employee_name}</p>
                        {l.advance_items.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {l.advance_items.length} advance(s) this month
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-money">
                        {formatTzs(l.gross_salary)}
                      </TableCell>
                      <TableCell className="text-right font-money text-warning">
                        {l.advances_total > 0
                          ? `− ${formatTzs(l.advances_total)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-money text-inflow">
                        {l.bonuses_total > 0
                          ? `+ ${formatTzs(l.bonuses_total)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-money font-semibold">
                        {formatTzs(l.net_salary)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              Add employee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Job title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gross monthly salary (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={newGross}
                onChange={(e) => setNewGross(e.target.value)}
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
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit employee</DialogTitle>
          </DialogHeader>
          {editTarget ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={editTarget.full_name}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, full_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Gross monthly salary</Label>
                <Input
                  type="number"
                  min={0}
                  value={editTarget.gross_monthly_salary}
                  onChange={(e) =>
                    setEditTarget({
                      ...editTarget,
                      gross_monthly_salary: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!editTarget || updateMut.isPending}
              onClick={() => editTarget && updateMut.mutate(editTarget)}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bonusTarget} onOpenChange={(o) => !o && setBonusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bonus — {bonusTarget?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Amount (TZS)</Label>
              <Input
                type="number"
                min={0}
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={bonusDesc} onChange={(e) => setBonusDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBonusTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!bonusTarget || !bonusAmount || bonusMut.isPending}
              onClick={() => bonusMut.mutate()}
            >
              Record bonus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Close payroll &amp; pay — {payrollMonth}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Choose how each employee receives their net salary. GL and banking
            accounts will be updated when you confirm.
          </p>
          <div className="space-y-4">
            {payDrafts.map((draft, idx) => {
              const line = payrollRun?.lines.find((l) => l.id === draft.lineId);
              if (!line) return null;
              return (
                <div
                  key={draft.lineId}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{line.employee_name}</span>
                    <span className="font-money font-semibold">
                      {formatTzs(line.net_salary)}
                    </span>
                  </div>
                  <Select
                    value={draft.paymentMethod}
                    onValueChange={(v) =>
                      setPayDrafts((prev) =>
                        prev.map((p, i) =>
                          i === idx
                            ? {
                                ...p,
                                paymentMethod: v as PayLineDraft["paymentMethod"],
                              }
                            : p
                        )
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  {needsCollectionAccount(draft.paymentMethod) ? (
                    <CollectionAccountSelect
                      paymentMethod={draft.paymentMethod}
                      value={draft.bankAccountId}
                      onValueChange={(id) =>
                        setPayDrafts((prev) =>
                          prev.map((p, i) =>
                            i === idx ? { ...p, bankAccountId: id } : p
                          )
                        )
                      }
                    />
                  ) : null}
                  <Input
                    placeholder="Reference (optional)"
                    value={draft.referenceNo}
                    onChange={(e) =>
                      setPayDrafts((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, referenceNo: e.target.value } : p
                        )
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={closeMut.isPending}
              onClick={() => closeMut.mutate()}
            >
              {closeMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Confirm &amp; close month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
