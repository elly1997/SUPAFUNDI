export const dynamic = "force-dynamic";

import { BusinessDataExportPanel } from "@/components/settings/business-data-export-panel";
import { CatalogBackupPanel } from "@/components/settings/catalog-backup-panel";
import { PageHeader } from "@/components/ui/page-header";

export default function DataSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Data & backup"
        description="Export business records and back up or restore the product catalog."
      />
      <CatalogBackupPanel />
      <BusinessDataExportPanel />
    </div>
  );
}
