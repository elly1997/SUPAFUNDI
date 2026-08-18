"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserSupabase } from "@/lib/supabase/client";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string().min(8, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export function SetPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setChecking(false);
      return;
    }
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setChecking(false);
      if (!data.user) {
        toast.error("Open the invite link from your email first.");
        router.replace("/login?error=invite");
      }
    });
  }, [router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const parsed = schema.safeParse({
      password: fd.get("password"),
      confirm: fd.get("confirm"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the password fields");
      return;
    }

    const supabase = getBrowserSupabase();
    if (!supabase) {
      toast.error("Could not connect. Refresh and try again.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      await supabase.auth.signOut();
      toast.success("Password saved. Sign in with your email.");
      router.replace("/login?password_set=1");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        Opening your invite…
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <div className="space-y-2">
        <Label htmlFor="invite-email">Username (email)</Label>
        <Input
          id="invite-email"
          value={email ?? ""}
          readOnly
          autoComplete="username"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">Create password</Label>
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !email}>
        {loading ? "Saving…" : "Save password and continue"}
      </Button>
    </form>
  );
}
