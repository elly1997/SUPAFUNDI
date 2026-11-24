export const dynamic = "force-dynamic";

import { UsersSettingsClient } from "@/components/settings/users-settings-client";
import { PageHeader } from "@/components/ui/page-header";

export default function UsersSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="Invite staff and assign them to outlets. Owners and managers can send email invites."
      />
      <UsersSettingsClient />
    </div>
  );
}
