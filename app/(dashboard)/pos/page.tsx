import { PosTerminal } from "@/components/pos/pos-terminal";
import { getSessionProfile } from "@/lib/auth/session";
import { getCachedOutlets } from "@/lib/server/cached-outlets";
import { redirect } from "next/navigation";

export default async function PosPage() {
  const profile = await getSessionProfile();
  if (!profile) {
    redirect("/login");
  }

  const outlets = await getCachedOutlets(profile.organizationId);

  return <PosTerminal outlets={outlets} />;
}
