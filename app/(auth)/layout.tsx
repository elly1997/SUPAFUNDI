import { BrandLogo } from "@/components/layout/brand-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-gradient flex min-h-screen flex-col items-center justify-center p-4">
      <div className="mb-8 w-full max-w-md">
        <BrandLogo href="/login" className="justify-center" />
      </div>
      <div className="login-card w-full max-w-md rounded-2xl bg-card p-1">
        {children}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-muted-foreground">
        Need help? Contact your system administrator or Supafundi support.
      </p>
    </div>
  );
}
