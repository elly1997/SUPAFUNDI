import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 lg:flex-row lg:gap-6">
      <SettingsNav />
      <div className="min-w-0 flex-1 space-y-4 pb-6">{children}</div>
    </div>
  );
}
