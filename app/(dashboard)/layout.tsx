import { redirect } from "next/navigation";
import { SessionHydrator } from "@/components/auth/session-hydrator";
import { ConfigRequired } from "@/components/shared/config-required";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getSessionProfile } from "@/lib/auth/session";
import { getPublicSupabaseEnv } from "@/lib/env/public";
import { getCachedOutlets } from "@/lib/server/cached-outlets";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!getPublicSupabaseEnv().ok) {
    return <ConfigRequired />;
  }

  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/setup");
  }

  const outlets = await getCachedOutlets(profile.organizationId);

  return (
    <SessionHydrator profile={profile} outlets={outlets}>
      <DashboardShell outlets={outlets}>{children}</DashboardShell>
    </SessionHydrator>
  );
}
