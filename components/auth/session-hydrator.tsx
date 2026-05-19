"use client";

import { useEffect } from "react";
import type { SessionProfile } from "@/lib/auth/session";
import { useAuthStore } from "@/stores/authStore";

type SessionHydratorProps = {
  profile: SessionProfile;
  children: React.ReactNode;
};

export function SessionHydrator({ profile, children }: SessionHydratorProps) {
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    setSession({
      userId: profile.userId,
      email: profile.email,
      fullName: profile.fullName,
      role: profile.role,
      organizationId: profile.organizationId,
      organizationName: profile.organizationName,
      outletId: profile.outletId,
    });
    setHydrated(true);
  }, [profile, setSession, setHydrated]);

  return <>{children}</>;
}
