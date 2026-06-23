import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { getDefaultLandingPath } from "@/lib/auth/roles";

export default async function HomePage() {
  const profile = await getSessionProfile();
  redirect(getDefaultLandingPath(profile?.role ?? null));
}
