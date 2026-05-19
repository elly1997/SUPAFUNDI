export const dynamic = "force-dynamic";

import { UsersSettingsClient } from "@/components/settings/users-settings-client";

export default function UsersSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite staff and assign roles. Owners and managers can edit team
          members.
        </p>
      </div>
      <UsersSettingsClient />
    </div>
  );
}
