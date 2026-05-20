"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Store, Trash2 } from "lucide-react";
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
import { fetchSettingsOutlets } from "@/lib/api/settings-team-fetch";
import {
  createOutlet,
  deleteOutlet,
  setDefaultOutlet,
  updateOutlet,
} from "@/lib/actions/settings";
import type { OutletRow } from "@/lib/types/settings-team";

export function OutletsSettingsClient() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<OutletRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<OutletRow | null>(null);
  const queryClient = useQueryClient();

  const {
    data: outlets = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["settings-outlets"],
    queryFn: fetchSettingsOutlets,
  });

  const resetForm = () => {
    setName("");
    setCode("");
    setAddress("");
    setPhone("");
    setIsActive(true);
    setEdit(null);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = (row: OutletRow) => {
    setEdit(row);
    setName(row.name);
    setCode(row.code ?? "");
    setAddress(row.address ?? "");
    setPhone(row.phone ?? "");
    setIsActive(row.is_active);
    setOpen(true);
  };

  const defaultMut = useMutation({
    mutationFn: setDefaultOutlet,
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Default outlet updated");
        queryClient.invalidateQueries({ queryKey: ["settings-outlets"] });
        queryClient.invalidateQueries({ queryKey: ["outlets"] });
      } else toast.error(r.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteOutlet(id),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Outlet deleted");
        setDeleteTarget(null);
        queryClient.invalidateQueries({ queryKey: ["settings-outlets"] });
        queryClient.invalidateQueries({ queryKey: ["outlets"] });
      } else toast.error(r.message);
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        code,
        address,
        phone,
        isActive,
      };
      if (edit) return updateOutlet(edit.id, payload);
      return createOutlet(payload);
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(edit ? "Outlet updated" : "Outlet created");
        setOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ["settings-outlets"] });
        queryClient.invalidateQueries({ queryKey: ["outlets"] });
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          Outlets / branches
        </CardTitle>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add outlet
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Branch codes appear on invoices and POs (e.g. MAIN-2026-00001). Use
          unique 2–8 character codes per outlet. The main default outlet cannot
          be deleted; other branches can be removed from this panel.
        </p>
        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Could not load outlets</p>
            <p className="mt-1 text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              If this mentions <code className="text-foreground">is_default</code>,
              run the Supabase migration{" "}
              <code className="text-foreground">
                20260520120000_outlet_default_expense_categories.sql
              </code>{" "}
              in the SQL Editor.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : outlets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No outlets yet. Add your main store and other branches with{" "}
            <strong>Add outlet</strong>.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {outlets.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>{o.code ?? "—"}</TableCell>
                  <TableCell>{o.phone ?? "—"}</TableCell>
                  <TableCell>
                    {o.is_default ? (
                      <span className="text-xs font-semibold text-primary">
                        Main default
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={defaultMut.isPending}
                        onClick={() => defaultMut.mutate(o.id)}
                      >
                        Set default
                      </Button>
                    )}
                  </TableCell>
                  <TableCell>{o.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>
                        Edit
                      </Button>
                      {!o.is_default ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDeleteTarget(o)}
                        >
                          <Trash2 className="mr-1 size-3.5" />
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete outlet?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <strong className="text-foreground">{deleteTarget?.name}</strong>
            {deleteTarget?.code ? ` (${deleteTarget.code})` : ""}? Stock and
            records for this branch will be removed. This cannot be undone.
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
              {deleteMut.isPending ? "Deleting…" : "Delete outlet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit outlet" : "New outlet"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Code (optional)</Label>
              <Input
                value={code}
                maxLength={8}
                placeholder="MAIN"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            {edit && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active
              </label>
            )}
          </div>
          <DialogFooter>
            <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

