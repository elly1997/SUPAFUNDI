"use client";

import { useEffect } from "react";
import type { SessionProfile } from "@/lib/auth/session";
import type { OutletLike } from "@/lib/outlets/resolve-default";
import { useAuthStore } from "@/stores/authStore";

type SessionHydratorProps = {
  profile: SessionProfile;
  outlets: OutletLike[];
  children: React.ReactNode;
};

export function SessionHydrator({
  profile,
  outlets,
  children,
}: SessionHydratorProps) {
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    setSession(
      {
        userId: profile.userId,
        email: profile.email,
        fullName: profile.fullName,
        role: profile.role,
        organizationId: profile.organizationId,
        organizationName: profile.organizationName,
        outletId: profile.outletId,
      },
      outlets
    );
    setHydrated(true);
  }, [profile, outlets, setSession, setHydrated]);

  return <>{children}</>;
}
