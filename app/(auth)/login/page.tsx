import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="rounded-xl p-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Access your hardware store workspace
        </p>
      </div>
      <Suspense
        fallback={<p className="text-center text-sm text-muted-foreground">Loading…</p>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
