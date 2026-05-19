import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function CashSessionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash drawer"
        description="Open and close register sessions, track expected cash and variance."
        actions={
          <Link href="/pos" className={cn(buttonVariants())}>
            Manage on POS
          </Link>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Session control</CardTitle>
          <CardDescription>
            Cash sessions are opened and closed from the POS terminal. A dedicated
            history view will be added in a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/pos"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Go to POS Terminal
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
