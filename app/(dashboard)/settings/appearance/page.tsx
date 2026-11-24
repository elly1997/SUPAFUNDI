import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { PageHeader } from "@/components/ui/page-header";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Appearance"
        description="Choose how SUPAFUNDI looks on this device."
      />
      <AppearanceSettings />
    </div>
  );
}
