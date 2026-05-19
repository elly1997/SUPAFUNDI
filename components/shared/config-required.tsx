import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfigRequired() {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-lg rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Supabase not configured</h1>
        {isProd ? (
          <div className="mt-2 text-left text-sm text-muted-foreground">
            <p>
              Netlify does not use your local <code className="text-xs">.env.local</code>{" "}
              file. Add these under{" "}
              <strong>Site configuration → Environment variables</strong>, then
              redeploy:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code>
              </li>
              <li>
                <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
              </li>
              <li>
                <code className="text-xs">NEXT_PUBLIC_APP_URL</code> — your live
                URL (e.g. https://your-site.netlify.app)
              </li>
            </ul>
            <p className="mt-2">
              Copy values from Supabase → Project Settings → API. Keys must be
              full JWT strings (not placeholders).
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Copy <code className="text-xs">.env.example</code> to{" "}
            <code className="text-xs">.env.local</code>, add your project URL and
            anon key, then restart the dev server.
          </p>
        )}
        <Link href="/login" className={cn(buttonVariants(), "mt-6 inline-flex")}>
          Go to login
        </Link>
      </div>
    </div>
  );
}
