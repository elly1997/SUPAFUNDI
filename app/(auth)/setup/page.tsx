import { SetupForm } from "@/components/auth/setup-form";

export default function SetupPage() {
  return (
    <div className="rounded-xl border bg-card p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your business
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your organization and first outlet. You can add more outlets
          later in Settings.
        </p>
      </div>
      <SetupForm />
    </div>
  );
}
