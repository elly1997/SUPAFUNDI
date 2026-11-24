export const dynamic = "force-dynamic";

import { SmsSettingsPanel } from "@/components/settings/sms-settings-panel";
import { PageHeader } from "@/components/ui/page-header";

export default function SmsSettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="SMS & marketing"
        description="Credit reminders, marketing messages, and Africa's Talking connection."
      />
      <SmsSettingsPanel />
    </div>
  );
}
