"use client";

import Link from "next/link";
import { OutletsSettingsClient } from "@/components/settings/outlets-settings-client";
import { UsersSettingsClient } from "@/components/settings/users-settings-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Main-store admin: register branches and assign staff to outlets.
 */
export function OrganizationAdminPanel() {
  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-card">
        <CardHeader>
          <CardTitle>Organization &amp; team</CardTitle>
          <CardDescription>
            Register outlets (branches) and assign each user to their home
            outlet. The default outlet is used for imports, POS, and reports
            when no branch is selected. Mark one outlet as{" "}
            <strong className="text-foreground">Default</strong> in the outlets
            table (typically Main Store / MAIN).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/settings/outlets"
            className="text-primary underline-offset-4 hover:underline"
          >
            Outlets only
          </Link>
          <span className="text-muted-foreground">·</span>
          <Link
            href="/settings/users"
            className="text-primary underline-offset-4 hover:underline"
          >
            Users only
          </Link>
        </CardContent>
      </Card>
      <UsersSettingsClient />
      <OutletsSettingsClient />
    </div>
  );
}
