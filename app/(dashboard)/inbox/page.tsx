import { redirect } from "next/navigation";
import { InboxPageClient } from "@/components/inbox/inbox-page-client";
import { canAccessInbox } from "@/lib/auth/roles";
import { getSessionProfile } from "@/lib/auth/session";

export default async function InboxPage() {
  const profile = await getSessionProfile();
  if (!profile || !canAccessInbox(profile.role)) {
    redirect("/pos");
  }
  return <InboxPageClient />;
}
