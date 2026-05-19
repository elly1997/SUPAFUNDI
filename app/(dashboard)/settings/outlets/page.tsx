export const dynamic = "force-dynamic";

import { OutletsSettingsClient } from "@/components/settings/outlets-settings-client";

export default function OutletsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outlets</h1>
        <p className="text-sm text-muted-foreground">
          Branches and warehouse locations for stock and POS.
        </p>
      </div>
      <OutletsSettingsClient />
    </div>
  );
}
