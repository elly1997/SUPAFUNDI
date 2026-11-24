export const dynamic = "force-dynamic";

import { OutletsSettingsClient } from "@/components/settings/outlets-settings-client";
import { PageHeader } from "@/components/ui/page-header";

export default function OutletsSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Outlets"
        description="Branches and warehouse locations for stock and POS."
      />
      <OutletsSettingsClient />
    </div>
  );
}
