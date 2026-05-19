"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
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
import { USER_ROLES } from "@/lib/auth/roles";
import { listOutletsForOrg } from "@/lib/actions/inventory";
import {
  inviteOrganizationUser,
  listOrganizationUsers,
  updateOrganizationUser,
  type UserRow,
} from "@/lib/actions/settings";

export function UsersSettingsClient() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [outletId, setOutletId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["settings-users"],
    queryFn: listOrganizationUsers,
  });
  const { data: outlets = [] } = useQuery({
    queryKey: ["outlets"],
    queryFn: listOutletsForOrg,
  });

  const reset = () => {
    setEdit(null);
    setEmail("");
    setFullName("");
    setRole("cashier");
    setOutletId("");
    setIsActive(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (edit) {
        return updateOrganizationUser(edit.id, {
          fullName,
          role: role as (typeof USER_ROLES)[number],
          outletId: outletId || null,
          isActive,
        });
      }
      return inviteOrganizationUser({
        email,
        fullName,
        role: role as (typeof USER_ROLES)[number],
        outletId: outletId || null,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(edit ? "User updated" : "Invitation sent");
        setOpen(false);
        reset();
        queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      } else toast.error(r.message);
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Team members</CardTitle>
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Invite user
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Outlet</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.full_name ?? "—"}</TableCell>
                  <TableCell>{u.email ?? "—"}</TableCell>
                  <TableCell className="capitalize">{u.role}</TableCell>
                  <TableCell>{u.outlet_name ?? "—"}</TableCell>
                  <TableCell>{u.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEdit(u);
                        setFullName(u.full_name ?? "");
                        setRole(u.role);
                        setOutletId(u.outlet_id ?? "");
                        setIsActive(u.is_active);
                        setOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit user" : "Invite user"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!edit && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v ?? "cashier")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Home outlet</Label>
              <Select
                value={outletId || "__none__"}
                onValueChange={(v) => setOutletId(!v || v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {saveMut.isPending ? "Saving…" : edit ? "Update" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

