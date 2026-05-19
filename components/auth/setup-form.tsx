"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const setupSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters"),
  outletName: z
    .string()
    .trim()
    .min(2, "First outlet name must be at least 2 characters"),
  phone: z.string().trim().max(40).optional(),
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

export function SetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    const fd = new FormData(event.currentTarget);
    const phoneRaw = String(fd.get("phone") ?? "").trim();
    const parsed = setupSchema.safeParse({
      organizationName: fd.get("organizationName"),
      outletName: fd.get("outletName"),
      ...(phoneRaw ? { phone: phoneRaw } : {}),
    });
    if (!parsed.success) {
      const fieldErrors = errorsFromZod(parsed.error);
      setErrors(fieldErrors);
      toast.error(
        fieldErrors.organizationName ??
          fieldErrors.outletName ??
          "Please fix the highlighted fields"
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/organization/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          organizationName: parsed.data.organizationName,
          outletName: parsed.data.outletName,
          phone: phoneRaw || undefined,
          currency: "TZS",
          country: "TZ",
        }),
      });

      let data: { ok: boolean; message?: string };
      try {
        data = (await response.json()) as { ok: boolean; message?: string };
      } catch {
        toast.error(
          "Setup failed: invalid server response. Restart npm run dev and try again."
        );
        return;
      }

      if (data.ok) {
        toast.success("Organization ready");
        router.push("/");
        router.refresh();
      } else {
        toast.error(data.message ?? `Setup failed (${response.status})`);
      }
    } catch {
      toast.error(
        "Could not reach the app server. Check npm run dev is running and refresh."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="space-y-4"
      method="post"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="space-y-2">
        <Label htmlFor="organizationName">Business name</Label>
        <Input
          id="organizationName"
          name="organizationName"
          placeholder="e.g. Mwanza Hardware Ltd"
          defaultValue=""
          disabled={loading}
        />
        {errors.organizationName && (
          <p className="text-xs text-destructive">{errors.organizationName}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="outletName">First outlet / branch</Label>
        <Input
          id="outletName"
          name="outletName"
          placeholder="e.g. City Centre Branch"
          defaultValue="Main Store"
          disabled={loading}
        />
        {errors.outletName && (
          <p className="text-xs text-destructive">{errors.outletName}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Setting up…" : "Complete setup"}
      </Button>
    </form>
  );
}
