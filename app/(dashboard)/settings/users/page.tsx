export const dynamic = "force-dynamic";

import { UsersSettingsClient } from "@/components/settings/users-settings-client";

export default function UsersSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Invite cashiers, managers, accountants, and other staff. Owners can
          assign existing users to another outlet with a login username (email)
          and password. Owners and managers can send email invites.
        </p>
      </div>
      <UsersSettingsClient />
    </div>
  );
}
