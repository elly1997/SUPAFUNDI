export const dynamic = "force-dynamic";

import { GeneralSettingsClient } from "@/components/settings/general-settings-client";
import { PageHeader } from "@/components/ui/page-header";
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
    <div className="space-y-4">
      <PageHeader
        title="General"
        description="Company profile, VAT, retail margin, receipts, and cash drawer rules."
      />
      {settings ? (
        <GeneralSettingsClient initial={settings} />
      ) : (
        <p className="text-sm text-muted-foreground">Unable to load settings.</p>
      )}
    </div>
  );
}
