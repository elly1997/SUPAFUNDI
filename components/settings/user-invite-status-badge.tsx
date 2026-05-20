import type { UserInviteStatus } from "@/lib/types/settings-team";
import { cn } from "@/lib/utils";

const LABELS: Record<UserInviteStatus, string> = {
  active: "Active",
  pending_invite: "Invite pending",
  inactive: "Inactive",
};

const STYLES: Record<UserInviteStatus, string> = {
  active: "bg-success/15 text-success",
  pending_invite: "bg-warning/15 text-warning",
  inactive: "bg-muted text-muted-foreground",
};

export function UserInviteStatusBadge({
  status,
  invitedAt,
}: {
  status: UserInviteStatus;
  invitedAt?: string | null;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-col items-start gap-0.5 rounded-md px-2 py-1 text-xs font-semibold",
        STYLES[status]
      )}
    >
      <span>{LABELS[status]}</span>
      {status === "pending_invite" && invitedAt ? (
        <span className="text-[10px] font-normal opacity-90">
          Sent {new Date(invitedAt).toLocaleDateString()}
        </span>
      ) : null}
    </span>
  );
}
