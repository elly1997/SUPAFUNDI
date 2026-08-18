"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Mail, Store, UserPlus } from "lucide-react";
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
  USER_ROLES,
  canAssignOutletAccess,
  canAssignOwnerRole,
  canInviteUsers,
  isUserRole,
} from "@/lib/auth/roles";
import { fetchOrgOutlets } from "@/lib/api/org-outlets-fetch";
import { resolveDefaultOutletId } from "@/lib/outlets/resolve-default";
import { UserInviteStatusBadge } from "@/components/settings/user-invite-status-badge";
import { fetchSettingsUsers } from "@/lib/api/settings-team-fetch";
import {
  inviteOrganizationUser,
  resendOrganizationUserInvite,
  updateOrganizationUser,
} from "@/lib/actions/settings";
import { useAuthStore } from "@/stores/authStore";
import {
  assignUserToOutlet,
  issueOutletAccessOtp,
  type AssignUserToOutletResult,
  type IssueOutletAccessOtpResult,
} from "@/lib/actions/outlet-access";
import type { UserRow } from "@/lib/types/settings-team";

type IssuedOtp = Extract<IssueOutletAccessOtpResult, { ok: true }>;
type AssignedOutlet = Extract<AssignUserToOutletResult, { ok: true }>;

const ROLE_LABELS: Record<(typeof USER_ROLES)[number], string> = {
  owner: "Owner — full access, switch outlets",
  manager: "Manager — approve transfers, invite staff",
  cashier: "Cashier — POS and daily sales",
  accountant: "Accountant — finance and reports",
  sales_rep: "Sales rep — POS and customer sales",
  viewer: "Viewer — read-only reports",
};

export function UsersSettingsClient() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [outletId, setOutletId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [otpUser, setOtpUser] = useState<UserRow | null>(null);
  const [otpOutletId, setOtpOutletId] = useState("");
  const [otpResult, setOtpResult] = useState<IssuedOtp | null>(null);
  const [assignUser, setAssignUser] = useState<UserRow | null>(null);
  const [assignOutletId, setAssignOutletId] = useState("");
  const [assignPassword, setAssignPassword] = useState("");
  const [assignAsHome, setAssignAsHome] = useState(true);
  const [assignResult, setAssignResult] = useState<AssignedOutlet | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const queryClient = useQueryClient();
  const sessionRole = useAuthStore((s) => s.session?.role ?? null);
  const actorRole = isUserRole(sessionRole ?? "") ? sessionRole : null;
  const canInvite = canInviteUsers(actorRole);
  const canAssignOwner = canAssignOwnerRole(actorRole);
  const canAssignOutlet = canAssignOutletAccess(actorRole);
  const assignableRoles = USER_ROLES.filter(
    (r) => r !== "owner" || canAssignOwner
  );

  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["settings-users"],
    queryFn: fetchSettingsUsers,
  });
  const {
    data: outlets = [],
    isLoading: outletsLoading,
    isError: outletsError,
  } = useQuery({
    queryKey: ["org-outlets"],
    queryFn: fetchOrgOutlets,
  });

  const defaultOutletId = resolveDefaultOutletId(outlets) ?? "";

  const reset = () => {
    setEdit(null);
    setEmail("");
    setFullName("");
    setRole("cashier");
    setOutletId(defaultOutletId);
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
        queryClient.invalidateQueries({ queryKey: ["org-outlets"] });
      } else toast.error(r.message);
    },
  });

  const resendMut = useMutation({
    mutationFn: (userId: string) => resendOrganizationUserInvite(userId),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Invitation resent");
        queryClient.invalidateQueries({ queryKey: ["settings-users"] });
      } else toast.error(r.message);
    },
  });

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!assignUser) throw new Error("No user selected");
      return assignUserToOutlet({
        userId: assignUser.id,
        outletId: assignOutletId,
        password: assignPassword,
        setAsHomeOutlet: assignAsHome,
      });
    },
    onSuccess: (r) => {
      if (r.ok) {
        setAssignResult(r);
        queryClient.invalidateQueries({ queryKey: ["settings-users"] });
        queryClient.invalidateQueries({ queryKey: ["org-outlets"] });
        toast.success(`${r.email} assigned to ${r.outletName}`);
      } else toast.error(r.message);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not assign outlet"),
  });

  const otpMut = useMutation({
    mutationFn: async () => {
      if (!otpUser) throw new Error("No user selected");
      return issueOutletAccessOtp({ userId: otpUser.id, outletId: otpOutletId });
    },
    onSuccess: (r) => {
      if (r.ok) {
        setOtpResult(r);
        setCopied(false);
      } else {
        toast.error(r.message);
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not issue code"),
  });

  const closeAssignDialog = () => {
    setAssignUser(null);
    setAssignOutletId("");
    setAssignPassword("");
    setAssignAsHome(true);
    setAssignResult(null);
    setCopiedCredentials(false);
    assignMut.reset();
  };

  const openAssignDialog = (u: UserRow) => {
    setAssignUser(u);
    setAssignOutletId(u.outlet_id ?? defaultOutletId);
    setAssignPassword("");
    setAssignAsHome(true);
    setAssignResult(null);
    setCopiedCredentials(false);
    assignMut.reset();
  };

  const copyCredentials = async () => {
    if (!assignResult || !assignPassword) return;
    const text = `Login: ${assignResult.email}\nPassword: ${assignPassword}\nOutlet: ${assignResult.outletName}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCredentials(true);
      toast.success("Login details copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const openOtpDialog = (u: UserRow) => {
    setOtpUser(u);
    setOtpResult(null);
    setCopied(false);
    setOtpOutletId(u.outlet_id ?? defaultOutletId);
    otpMut.reset();
  };

  const closeOtpDialog = () => {
    setOtpUser(null);
    setOtpResult(null);
    setCopied(false);
    otpMut.reset();
  };

  const copyOtp = async () => {
    if (!otpResult) return;
    try {
      await navigator.clipboard.writeText(otpResult.code);
      setCopied(true);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed — select the code manually.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Team members</CardTitle>
        {canInvite ? (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Invite user
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium text-destructive">Could not load team</p>
            <p className="mt-1 text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No team members yet. Use <strong>Invite user</strong> to add staff;
            pending invites appear here with status.
          </p>
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
                  <TableCell>
                    <div className="space-y-0.5">
                      <span>{u.outlet_name ?? "—"}</span>
                      {u.granted_outlet_names.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Also: {u.granted_outlet_names.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserInviteStatusBadge
                      status={u.invite_status}
                      invitedAt={u.invited_at}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {u.invite_status === "pending_invite" && canInvite ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={resendMut.isPending}
                          onClick={() => resendMut.mutate(u.id)}
                          title="Resend invitation email"
                        >
                          <Mail className="mr-1 h-4 w-4" />
                          Resend
                        </Button>
                      ) : null}
                      {canAssignOutlet && u.role !== "owner" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAssignDialog(u)}
                          title="Assign outlet and set login password"
                        >
                          <Store className="mr-1 h-4 w-4" />
                          Assign outlet
                        </Button>
                      ) : null}
                      {canInvite && !canAssignOutlet ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openOtpDialog(u)}
                          title="Send an outlet access code to the owner to share"
                        >
                          <KeyRound className="mr-1 h-4 w-4" />
                          Access code
                        </Button>
                      ) : null}
                      {canInvite ? (
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
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[role as (typeof USER_ROLES)[number]] ??
                  "Choose a role for this team member."}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Home outlet</Label>
              <Select
                value={outletId || "__none__"}
                onValueChange={(v) => setOutletId(!v || v === "__none__" ? "" : v)}
                disabled={outletsLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      outletsLoading ? "Loading outlets…" : "Optional"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.code ? ` (${o.code})` : ""}
                      {o.is_active === false ? " — Inactive" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {outletsError ? (
                <p className="text-xs text-destructive">
                  Could not load outlets. Check your connection and refresh the
                  page.
                </p>
              ) : !outletsLoading && outlets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No outlets yet. Add one under Settings → Outlets first.
                </p>
              ) : null}
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

      <Dialog
        open={!!otpUser}
        onOpenChange={(v) => {
          if (!v) closeOtpDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Outlet access code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a 6-digit code for{" "}
              <strong>{otpUser?.full_name ?? otpUser?.email ?? "this user"}</strong>
              . It is sent to the owner (by SMS when configured) to share with the
              user, who enters it to unlock the outlet.
            </p>
            <div className="space-y-2">
              <Label>Outlet</Label>
              <Select
                value={otpOutletId || "__none__"}
                onValueChange={(v) =>
                  setOtpOutletId(!v || v === "__none__" ? "" : v)
                }
                disabled={outletsLoading || otpMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      outletsLoading ? "Loading outlets…" : "Choose an outlet"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    Choose an outlet
                  </SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.code ? ` (${o.code})` : ""}
                      {o.is_active === false ? " — Inactive" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {otpResult ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Code for {otpResult.outletName}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl font-bold tracking-[0.3em]">
                    {otpResult.code}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyOtp}
                  >
                    {copied ? (
                      <Check className="mr-1 h-4 w-4" />
                    ) : (
                      <Copy className="mr-1 h-4 w-4" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {otpResult.deliveryMessage} Expires{" "}
                  {new Date(otpResult.expiresAt).toLocaleTimeString()}.
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={!otpOutletId || otpMut.isPending}
              onClick={() => otpMut.mutate()}
            >
              {otpMut.isPending
                ? "Generating…"
                : otpResult
                  ? "Generate new code"
                  : "Generate code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!assignUser}
        onOpenChange={(v) => {
          if (!v) closeAssignDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign outlet &amp; login</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move an existing team member to another outlet. Set a password
              they will use to sign in (username is their email).
            </p>
            <div className="space-y-2">
              <Label>User</Label>
              <Input
                readOnly
                value={
                  assignUser
                    ? `${assignUser.full_name ?? assignUser.email ?? "User"} (${assignUser.email ?? "no email"})`
                    : ""
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Outlet</Label>
              <Select
                value={assignOutletId || "__none__"}
                onValueChange={(v) =>
                  setAssignOutletId(!v || v === "__none__" ? "" : v)
                }
                disabled={outletsLoading || assignMut.isPending}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      outletsLoading ? "Loading outlets…" : "Choose an outlet"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>
                    Choose an outlet
                  </SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.code ? ` (${o.code})` : ""}
                      {o.is_active === false ? " — Inactive" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Login password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={assignPassword}
                onChange={(e) => setAssignPassword(e.target.value)}
                disabled={assignMut.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Share this password with the user. Their username is{" "}
                <strong className="text-foreground">{assignUser?.email}</strong>.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignAsHome}
                onChange={(e) => setAssignAsHome(e.target.checked)}
                disabled={assignMut.isPending}
              />
              Set as home outlet (where they work by default)
            </label>

            {assignResult ? (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                <p className="font-medium text-foreground">
                  Assigned to {assignResult.outletName}
                </p>
                <p>
                  <span className="text-muted-foreground">Username:</span>{" "}
                  <span className="font-mono">{assignResult.email}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Password:</span>{" "}
                  <span className="font-mono">{assignPassword}</span>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyCredentials}
                >
                  {copiedCredentials ? (
                    <Check className="mr-1 h-4 w-4" />
                  ) : (
                    <Copy className="mr-1 h-4 w-4" />
                  )}
                  {copiedCredentials ? "Copied" : "Copy login details"}
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              disabled={
                !assignOutletId ||
                assignPassword.length < 8 ||
                assignMut.isPending
              }
              onClick={() => assignMut.mutate()}
            >
              {assignMut.isPending
                ? "Saving…"
                : assignResult
                  ? "Update again"
                  : "Assign & set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

