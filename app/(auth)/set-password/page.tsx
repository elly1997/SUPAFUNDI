import { SetPasswordForm } from "@/components/auth/set-password-form";

export default function SetPasswordPage() {
  return (
    <div className="rounded-xl p-8">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight">Create your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This is your login, not the owner account. Choose a password for your
          email, then sign in.
        </p>
      </div>
      <SetPasswordForm />
    </div>
  );
}
