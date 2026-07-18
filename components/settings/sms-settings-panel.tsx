"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchSmsSettings,
  sendTestSmsApi,
  updateSmsSettingsApi,
} from "@/lib/api/sms-fetch";

export function SmsSettingsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sms-settings"],
    queryFn: fetchSmsSettings,
  });

  const [form, setForm] = useState({
    creditTemplate: "",
    marketingTemplate: "",
    reminderCooldownDays: 7,
    marketingEnabled: false,
  });
  const [testPhone, setTestPhone] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({
      creditTemplate: data.creditTemplate,
      marketingTemplate: data.marketingTemplate,
      reminderCooldownDays: data.reminderCooldownDays,
      marketingEnabled: data.marketingEnabled,
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => updateSmsSettingsApi(form),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("SMS settings saved");
        void queryClient.invalidateQueries({ queryKey: ["sms-settings"] });
      } else toast.error(r.message);
    },
  });

  const testMut = useMutation({
    mutationFn: () => sendTestSmsApi(testPhone.trim()),
    onSuccess: (r) => {
      if (r.ok) toast.success("Test SMS sent — check the phone.");
      else toast.error(r.message);
    },
  });

  if (isLoading && !data) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          SMS messaging (Africa&apos;s Talking)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Credit balance reminders and optional marketing messages. Provider
          keys are set in server environment (
          <code className="text-xs">AT_API_KEY</code>,{" "}
          <code className="text-xs">AT_USERNAME</code>, optional{" "}
          <code className="text-xs">AT_SENDER_ID</code>).
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            data?.configured
              ? "border-inflow/40 bg-inflow/10 text-inflow"
              : "border-warning/40 bg-warning/10 text-warning"
          }`}
        >
          {data?.configured
            ? "Provider configured — SMS can be sent from Customers."
            : "Provider not configured — add AT_API_KEY and AT_USERNAME to .env.local (dev) or Netlify env (production). Use AT_SANDBOX=true while testing."}
        </div>

        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
          <Label htmlFor="sms-test-phone">Test connection</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="sms-test-phone"
              type="tel"
              placeholder="07XXXXXXXX"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="sm:flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 shrink-0"
              disabled={!data?.configured || !testPhone.trim() || testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              {testMut.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Send test SMS
            </Button>
          </div>
          <p className="form-hint">
            Sends a one-line test to verify your Africa&apos;s Talking API key
            and sender ID. Tanzania mobile numbers only.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Credit reminder template</Label>
          <Textarea
            rows={4}
            value={form.creditTemplate}
            onChange={(e) =>
              setForm((f) => ({ ...f, creditTemplate: e.target.value }))
            }
          />
          <p className="form-hint">
            Placeholders: {"{{name}}"}, {"{{balance}}"}, {"{{shopPhone}}"},{" "}
            {"{{shopName}}"}. Shop phone comes from company profile above.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Marketing template</Label>
          <Textarea
            rows={3}
            value={form.marketingTemplate}
            onChange={(e) =>
              setForm((f) => ({ ...f, marketingTemplate: e.target.value }))
            }
          />
          <p className="form-hint">
            Placeholders: {"{{message}}"}, {"{{name}}"}, {"{{shopPhone}}"},{" "}
            {"{{shopName}}"}. Only customers who opted in receive marketing
            SMS.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Reminder cooldown (days)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={form.reminderCooldownDays}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  reminderCooldownDays: Number(e.target.value) || 7,
                }))
              }
            />
            <p className="form-hint">
              Minimum days between automatic-style reminders per customer.
            </p>
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input
              id="sms-marketing-enabled"
              type="checkbox"
              className="size-4 rounded border-border"
              checked={form.marketingEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, marketingEnabled: e.target.checked }))
              }
            />
            <Label htmlFor="sms-marketing-enabled" className="cursor-pointer">
              Allow marketing SMS campaigns
            </Label>
          </div>
        </div>

        <Button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : null}
          Save SMS settings
        </Button>
      </CardContent>
    </Card>
  );
}
