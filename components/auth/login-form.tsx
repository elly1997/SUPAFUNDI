"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithPasswordClient,
  signUpWithPasswordClient,
} from "@/lib/auth/client-auth";

const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FieldErrors = Partial<Record<string, string>>;

function errorsFromZod(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0]?.toString();
    if (key && !out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const inviteError = searchParams.get("error");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [signInErrors, setSignInErrors] = useState<FieldErrors>({});
  const [signUpErrors, setSignUpErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (inviteError === "invite") {
      toast.error(
        "This invite link is invalid or expired. Ask the owner to resend the invite."
      );
    }
    if (searchParams.get("password_set") === "1") {
      toast.success("Password saved. Sign in with your email and new password.");
    }
  }, [inviteError, searchParams]);

  const handleSignInSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignInErrors({});
    const form = event.currentTarget;
    const fd = new FormData(form);
    const parsed = signInSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      const fieldErrors = errorsFromZod(parsed.error);
      setSignInErrors(fieldErrors);
      toast.error(
        fieldErrors.email ??
          fieldErrors.password ??
          "Please fix the highlighted fields"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await signInWithPasswordClient(
        parsed.data.email,
        parsed.data.password
      );
      if (res.ok) {
        toast.success("Signed in");
        router.push(next);
        router.refresh();
      } else {
        const msg = res.message.toLowerCase();
        if (msg.includes("invalid login credentials")) {
          toast.error(
            "No account with that email/password. Use Create account first, or reset your password in Supabase."
          );
        } else {
          toast.error(res.message);
        }
      }
    } catch {
      toast.error("Sign in failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignUpErrors({});
    const fd = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: fd.get("fullName"),
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      const fieldErrors = errorsFromZod(parsed.error);
      setSignUpErrors(fieldErrors);
      toast.error(
        fieldErrors.fullName ??
          fieldErrors.email ??
          fieldErrors.password ??
          "Please fix the highlighted fields"
      );
      return;
    }

    setLoading(true);
    try {
      const res = await signUpWithPasswordClient(
        parsed.data.fullName,
        parsed.data.email,
        parsed.data.password
      );
      if (res.ok) {
        if (res.needsEmailConfirmation) {
          toast.success(
            "Account created. Check your email to confirm, then sign in."
          );
          setMode("signin");
          event.currentTarget.reset();
          return;
        }
        toast.success("Account created — finish organization setup");
        router.push("/setup");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Sign up failed. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border p-1">
        <button
          type="button"
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
            mode === "signin"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          onClick={() => {
            setMode("signin");
            setSignInErrors({});
            setSignUpErrors({});
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md py-1.5 text-sm font-medium ${
            mode === "signup"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground"
          }`}
          onClick={() => {
            setMode("signup");
            setSignInErrors({});
            setSignUpErrors({});
          }}
        >
          Create account
        </button>
      </div>

      {mode === "signin" ? (
        <form
          className="space-y-4"
          method="post"
          onSubmit={handleSignInSubmit}
          noValidate
        >
          <p className="text-xs text-muted-foreground">
            New here? Use <strong>Create account</strong> first, then sign in.
          </p>
          <div className="space-y-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={loading}
            />
            {signInErrors.email && (
              <p className="text-xs text-destructive">{signInErrors.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={loading}
            />
            {signInErrors.password && (
              <p className="text-xs text-destructive">{signInErrors.password}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          method="post"
          onSubmit={handleSignUpSubmit}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              disabled={loading}
            />
            {signUpErrors.fullName && (
              <p className="text-xs text-destructive">{signUpErrors.fullName}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              disabled={loading}
            />
            {signUpErrors.email && (
              <p className="text-xs text-destructive">{signUpErrors.email}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              disabled={loading}
            />
            {signUpErrors.password && (
              <p className="text-xs text-destructive">{signUpErrors.password}</p>
            )}
            <p className="text-xs text-muted-foreground">
              At least 8 characters
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      )}
    </div>
  );
}
