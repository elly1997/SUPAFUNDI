export const dynamic = "force-dynamic";

import { GeneralSettingsClient } from "@/components/settings/general-settings-client";
import {
  getOrganizationSettings,
  seedOrgSettingsIfMissing,
} from "@/lib/actions/settings";

export default async function GeneralSettingsPage() {
  try {
    await seedOrgSettingsIfMissing();
  } catch {
    /* env not configured at build */
  }
  let settings = null;
  try {
    settings = await getOrganizationSettings();
  } catch {
    settings = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">General</h1>
        <p className="text-sm text-muted-foreground">
          Company details, tax, and POS defaults for your organization.
        </p>
      </div>
      {settings ? (
        <GeneralSettingsClient initial={settings} />
      ) : (
        <p className="text-sm text-muted-foreground">Unable to load settings.</p>
      )}
    </div>
  );
}
